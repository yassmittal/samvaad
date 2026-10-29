/**
 * Phase 0 API check for Muse Voice Transcribe (D-005). Streams WAV fixtures to the realtime
 * endpoint at real-time pace and prints every event with its arrival time, so the native
 * protocol can be recorded in `docs/decisions.md`.
 *
 *   bun run smoke:transcribe                               all fixtures, Hindi + English bias
 *   bun run smoke:transcribe scripts/fixtures/hindi.wav --language-bias Hindi
 *   bun run smoke:transcribe --keyword "Blue Pottery" --keyword Jaipur --verbose
 */
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { findSpeechEndMilliseconds } from './lib/find-speech-end';
import {
  META_TRANSCRIPTION_URL,
  readMetaApiKeyOrExit,
  TRANSCRIPTION_MODEL_ID,
} from './lib/meta-model-api';
import { parseWavFile, type WavAudio } from './lib/read-wav-file';

const MILLISECONDS_PER_SECOND = 1000;
const BYTES_PER_SAMPLE = 2;
// Same pacing as the browser will use (D-009). Meta rejects audio that runs too far ahead.
const FRAME_DURATION_MILLISECONDS = 80;
// Endpointing needs to hear a pause before it calls a sentence finished.
const TRAILING_SILENCE_MILLISECONDS = 2000;
const HANDSHAKE_RESPONSE_TIMEOUT_MILLISECONDS = 10_000;
const CLOSE_AFTER_END_STREAM_TIMEOUT_MILLISECONDS = 15_000;

const FIXTURES_DIRECTORY = join(import.meta.dir, 'fixtures');
const DEFAULT_FIXTURE_PATHS = ['hindi.wav', 'english.wav', 'hinglish.wav'].map((fileName) =>
  join(FIXTURES_DIRECTORY, fileName),
);

/** Field names in Meta's documented `ServerMessage` variants (dev.meta.ai, voice schemas). */
const DOCUMENTED_EVENT_FIELD_NAMES = new Set([
  'type',
  'transcript',
  'final',
  'turnId',
  'label',
  'audioProcessedMs',
  'message',
  'sessionId',
  'errorType',
  'errorCode',
  'errorParam',
]);

const AUDIO_ENCODING_BY_SAMPLE_RATE_HERTZ: Record<number, string> = {
  16000: 'PCM_16KHZ',
  24000: 'PCM_24KHZ',
};

type TranscriptionEvent = Record<string, unknown> & { type?: string };

type TranscriptionRunOptions = {
  fixturePath: string;
  metaApiKey: string;
  mode: string;
  languageBias: string[];
  keywords: string[];
  isVerbose: boolean;
};

const { values: options, positionals: fixturePathArguments } = parseArgs({
  allowPositionals: true,
  options: {
    mode: { type: 'string', default: 'ENDPOINTING' },
    'language-bias': { type: 'string', default: 'Hindi,English' },
    keyword: { type: 'string', multiple: true, default: [] },
    verbose: { type: 'boolean', default: false },
  },
});

function assertSupportedWav(wavAudio: WavAudio, fixturePath: string): string {
  const audioEncoding = AUDIO_ENCODING_BY_SAMPLE_RATE_HERTZ[wavAudio.sampleRateHertz];
  if (
    audioEncoding === undefined ||
    wavAudio.channelCount !== 1 ||
    wavAudio.bitsPerSample !== BYTES_PER_SAMPLE * 8
  ) {
    throw new Error(
      `${fixturePath} must be 16 or 24 kHz mono 16-bit PCM ` +
        `(found ${wavAudio.sampleRateHertz} Hz, ${wavAudio.channelCount} channels, ` +
        `${wavAudio.bitsPerSample}-bit).`,
    );
  }
  return audioEncoding;
}

function waitForNextTextMessage(socket: WebSocket, timeoutMilliseconds: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`No message within ${timeoutMilliseconds} ms.`)),
      timeoutMilliseconds,
    );
    socket.addEventListener(
      'message',
      (event) => {
        clearTimeout(timeout);
        resolve(String(event.data));
      },
      { once: true },
    );
  });
}

function openSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', () => reject(new Error(`Could not connect to ${url}`)), {
      once: true,
    });
  });
}

async function runTranscription({
  fixturePath,
  metaApiKey,
  mode,
  languageBias,
  keywords,
  isVerbose,
}: TranscriptionRunOptions): Promise<void> {
  const wavAudio = parseWavFile(new Uint8Array(await Bun.file(fixturePath).arrayBuffer()));
  const audioEncoding = assertSupportedWav(wavAudio, fixturePath);
  const bytesPerFrame =
    (wavAudio.sampleRateHertz * FRAME_DURATION_MILLISECONDS * BYTES_PER_SAMPLE) /
    MILLISECONDS_PER_SECOND;
  const trailingSilenceFrameCount = TRAILING_SILENCE_MILLISECONDS / FRAME_DURATION_MILLISECONDS;
  const audioDurationMilliseconds =
    (wavAudio.pcmBytes.byteLength / BYTES_PER_SAMPLE / wavAudio.sampleRateHertz) *
    MILLISECONDS_PER_SECOND;
  const speechEndMilliseconds = findSpeechEndMilliseconds(
    wavAudio.pcmBytes,
    wavAudio.sampleRateHertz,
  );

  console.log(`\n════ ${basename(fixturePath)} ════`);
  console.log(
    `audio: ${Math.round(audioDurationMilliseconds)} ms at ${wavAudio.sampleRateHertz} Hz, ` +
      `speech ends at ${speechEndMilliseconds ?? '?'} ms, ` +
      `+${TRAILING_SILENCE_MILLISECONDS} ms of silence appended`,
  );

  const handshake = {
    authorization: { accessToken: `Bearer ${metaApiKey}` },
    model: TRANSCRIPTION_MODEL_ID,
    audioEncoding,
    mode,
    ...(languageBias.length > 0 ? { languageBias } : {}),
    ...(keywords.length > 0 ? { keywords } : {}),
  };
  console.log(
    `handshake: ${JSON.stringify({ ...handshake, authorization: { accessToken: 'Bearer <redacted>' } })}`,
  );

  const socket = await openSocket(META_TRANSCRIPTION_URL);
  socket.binaryType = 'arraybuffer';
  // The key travels in the first text frame, not an HTTP header (dev.meta.ai realtime docs).
  socket.send(JSON.stringify(handshake));
  const handshakeResponseText = await waitForNextTextMessage(
    socket,
    HANDSHAKE_RESPONSE_TIMEOUT_MILLISECONDS,
  );
  console.log(`handshake response: ${handshakeResponseText}`);

  const streamStartedAtMilliseconds = performance.now();
  const formatElapsed = () =>
    `+${Math.round(performance.now() - streamStartedAtMilliseconds)
      .toString()
      .padStart(5)} ms`;
  const undocumentedFieldNames = new Set<string>();
  const finalTranscripts: { elapsedMilliseconds: number; transcript: string }[] = [];
  let audioProgressEventCount = 0;

  const closed = new Promise<CloseEvent>((resolve) => {
    socket.addEventListener('close', resolve, { once: true });
  });

  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') {
      console.log(`${formatElapsed()}  binary message, ${event.data.byteLength} bytes`);
      return;
    }
    const transcriptionEvent = JSON.parse(event.data) as TranscriptionEvent;
    for (const fieldName of Object.keys(transcriptionEvent)) {
      if (!DOCUMENTED_EVENT_FIELD_NAMES.has(fieldName)) {
        undocumentedFieldNames.add(fieldName);
      }
    }

    if (transcriptionEvent.type === 'audioProgress') {
      audioProgressEventCount++;
      if (!isVerbose) {
        return;
      }
    }
    if (
      transcriptionEvent.type === 'speechComplete' ||
      (transcriptionEvent.type === 'transcript' && transcriptionEvent.final === true)
    ) {
      finalTranscripts.push({
        elapsedMilliseconds: performance.now() - streamStartedAtMilliseconds,
        transcript: String(transcriptionEvent.transcript),
      });
    }
    console.log(`${formatElapsed()}  ${event.data}`);
  });

  const totalFrameCount = Math.ceil(wavAudio.pcmBytes.byteLength / bytesPerFrame);
  const silentFrame = new Uint8Array(bytesPerFrame);

  for (let frameIndex = 0; frameIndex < totalFrameCount + trailingSilenceFrameCount; frameIndex++) {
    if (socket.readyState !== WebSocket.OPEN) {
      break;
    }
    const frameStartByte = frameIndex * bytesPerFrame;
    socket.send(
      frameIndex < totalFrameCount
        ? wavAudio.pcmBytes.subarray(frameStartByte, frameStartByte + bytesPerFrame)
        : silentFrame,
    );
    // Schedule against the start time, so slow sends don't accumulate drift.
    const nextFrameDueAtMilliseconds =
      streamStartedAtMilliseconds + (frameIndex + 1) * FRAME_DURATION_MILLISECONDS;
    await Bun.sleep(Math.max(0, nextFrameDueAtMilliseconds - performance.now()));
  }

  if (socket.readyState === WebSocket.OPEN) {
    console.log(`${formatElapsed()}  → endStream`);
    socket.send(JSON.stringify({ type: 'endStream' }));
  }

  const closeTimeout = setTimeout(() => {
    console.log(`${formatElapsed()}  no close from Meta, closing ourselves`);
    socket.close();
  }, CLOSE_AFTER_END_STREAM_TIMEOUT_MILLISECONDS);
  const closeEvent = await closed;
  clearTimeout(closeTimeout);
  console.log(`${formatElapsed()}  closed: code ${closeEvent.code} ${closeEvent.reason}`);

  console.log('── summary ──');
  for (const finalTranscript of finalTranscripts) {
    console.log(`final transcript: ${finalTranscript.transcript}`);
  }
  const lastFinalTranscript = finalTranscripts.at(-1);
  if (lastFinalTranscript && speechEndMilliseconds !== null) {
    console.log(
      `end of speech → last final transcript: ` +
        `${Math.round(lastFinalTranscript.elapsedMilliseconds - speechEndMilliseconds)} ms`,
    );
  }
  console.log(`audioProgress events: ${audioProgressEventCount}`);
  console.log(
    `undocumented fields (a detected language would show up here): ` +
      `${[...undocumentedFieldNames].join(', ') || 'none'}`,
  );
}

const metaApiKey = readMetaApiKeyOrExit();
const fixturePaths = fixturePathArguments.length > 0 ? fixturePathArguments : DEFAULT_FIXTURE_PATHS;
const languageBias = options['language-bias']
  .split(',')
  .map((languageName) => languageName.trim())
  .filter((languageName) => languageName.length > 0);

for (const fixturePath of fixturePaths) {
  await runTranscription({
    fixturePath,
    metaApiKey,
    mode: options.mode,
    languageBias,
    keywords: options.keyword,
    isVerbose: options.verbose,
  });
}
