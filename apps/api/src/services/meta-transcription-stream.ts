import {
  BYTES_PER_FRAME,
  BYTES_PER_SAMPLE,
  FRAME_DURATION_MILLISECONDS,
  SAMPLE_RATE_HERTZ,
} from '@samvaad/shared';
import type { FastifyBaseLogger } from 'fastify';
import { calculateSpeechEndedAtEpochMilliseconds } from '../lib/calculate-speech-ended-at';
import { countSilencePaddingFrames } from '../lib/count-silence-padding-frames';
import {
  type MetaTranscriptionEvent,
  metaHandshakeResponseSchema,
  parseMetaTranscriptionEvent,
} from '../lib/meta-transcription-events';

const TRANSCRIPTION_MODEL_ID = 'muse-voice-transcribe-1.0';
// Matches SAMPLE_RATE_HERTZ; Meta resamples 16 kHz to its native 24 kHz (D-005, D-009).
const AUDIO_ENCODING = 'PCM_16KHZ';
const HANDSHAKE_RESPONSE_TIMEOUT_MILLISECONDS = 10_000;
const CLOSE_AFTER_END_STREAM_TIMEOUT_MILLISECONDS = 10_000;
// Meta tolerates only a few seconds of backlog, so don't queue more than that while connecting.
const MAXIMUM_QUEUED_AUDIO_MILLISECONDS = 4000;
const MAXIMUM_QUEUED_FRAME_COUNT = MAXIMUM_QUEUED_AUDIO_MILLISECONDS / FRAME_DURATION_MILLISECONDS;
const NORMAL_CLOSE_CODE = 1000;
const MILLISECONDS_PER_SECOND = 1000;

export type TranscriptionStreamCallbacks = {
  onSpeechStarted: (turnId: number) => void;
  onPartialTranscript: (text: string) => void;
  onSpeechEnded: (turnId: number, speechEndedAtEpochMilliseconds: number) => void;
  onFinalTranscript: (turnId: number, text: string) => void;
  /**
   * The stream broke before it was asked to end. Nothing more will arrive. `hasStreamed` says
   * the handshake had succeeded, so it worked and then broke, as with Meta's "Ingress audio
   * slower than real-time" (D-017).
   */
  onFailed: (failure: { reason: string; hasStreamed: boolean }) => void;
  /** The upstream socket is gone, for any reason. Always the last callback. */
  onClosed: () => void;
};

type MetaTranscriptionStreamOptions = {
  transcriptionUrl: string;
  metaApiKey: string;
  /** English language names, such as `["Hindi", "English"]` (D-005). */
  languageBias: string[];
  /** Names and terms to listen for, from the glossary (D-016). Fixed at the handshake (D-005). */
  keywords: string[];
  /**
   * When the forwarded audio falls this far behind real time, silence makes up the rest, so Meta
   * doesn't end the stream (D-024). `0` forwards only what the phone sends.
   */
  maximumAudioLagMilliseconds: number;
  callbacks: TranscriptionStreamCallbacks;
  logger: FastifyBaseLogger;
};

type StreamState = 'connecting' | 'streaming' | 'ending' | 'closed';

export type MetaTranscriptionStream = {
  sendAudioFrame: (frame: Uint8Array) => void;
  /** Sends `endStream`: Meta completes the open utterance, then closes the socket. */
  end: () => void;
  /** Closes at once. Pending results are dropped and no more callbacks run. */
  close: () => void;
};

function calculateAudioDurationMilliseconds(byteCount: number): number {
  return (byteCount / BYTES_PER_SAMPLE / SAMPLE_RATE_HERTZ) * MILLISECONDS_PER_SECOND;
}

/** One upstream WebSocket to Muse Voice Transcribe, for one speaker (D-005). */
export function createMetaTranscriptionStream({
  transcriptionUrl,
  metaApiKey,
  languageBias,
  keywords,
  maximumAudioLagMilliseconds,
  callbacks,
  logger,
}: MetaTranscriptionStreamOptions): MetaTranscriptionStream {
  const socket = new WebSocket(transcriptionUrl);
  socket.binaryType = 'arraybuffer';

  let state: StreamState = 'connecting';
  let isEndRequested = false;
  let audioReceivedBytes = 0;
  let lastAudioFrameReceivedAtEpochMilliseconds = Date.now();
  const queuedFrames: Uint8Array[] = [];
  // Real-time pacing (D-024), counted from Meta's handshake response.
  let streamingStartedAtEpochMilliseconds = 0;
  let audioSentBytes = 0;
  let silencePaddingFrameCount = 0;
  let pacingInterval: ReturnType<typeof setInterval> | null = null;

  const handshakeTimeout = setTimeout(() => {
    fail(`no handshake response within ${HANDSHAKE_RESPONSE_TIMEOUT_MILLISECONDS} ms`);
  }, HANDSHAKE_RESPONSE_TIMEOUT_MILLISECONDS);
  let endStreamCloseTimeout: ReturnType<typeof setTimeout> | null = null;

  function describePacing() {
    return {
      streamAgeMilliseconds:
        streamingStartedAtEpochMilliseconds === 0
          ? 0
          : Date.now() - streamingStartedAtEpochMilliseconds,
      audioSentMilliseconds: calculateAudioDurationMilliseconds(audioSentBytes),
      silencePaddingMilliseconds: silencePaddingFrameCount * FRAME_DURATION_MILLISECONDS,
    };
  }

  function stopPacing(): void {
    if (pacingInterval !== null) {
      clearInterval(pacingInterval);
      pacingInterval = null;
    }
  }

  /** Sends silence when the phone's audio has fallen behind real time (D-024). */
  function padToRealTime(): void {
    if (state !== 'streaming') {
      return;
    }
    const nowEpochMilliseconds = Date.now();
    const paddingFrameCount = countSilencePaddingFrames({
      elapsedMilliseconds: nowEpochMilliseconds - streamingStartedAtEpochMilliseconds,
      audioSentMilliseconds: calculateAudioDurationMilliseconds(audioSentBytes),
      maximumAudioLagMilliseconds,
      frameDurationMilliseconds: FRAME_DURATION_MILLISECONDS,
    });
    for (let frameIndex = 0; frameIndex < paddingFrameCount; frameIndex += 1) {
      // A new buffer is zero-filled: PCM16 silence.
      socket.send(new Uint8Array(BYTES_PER_FRAME));
      audioSentBytes += BYTES_PER_FRAME;
      // Meta's audio positions include the silence, so the speech-end maths must too (D-011).
      audioReceivedBytes += BYTES_PER_FRAME;
      lastAudioFrameReceivedAtEpochMilliseconds = nowEpochMilliseconds;
    }
    silencePaddingFrameCount += paddingFrameCount;
  }

  function fail(reason: string): void {
    if (state === 'closed') {
      return;
    }
    logger.warn({ reason, ...describePacing() }, 'transcription stream failed');
    const wasEnding = state === 'ending';
    const hasStreamed = state === 'streaming';
    finishClosing();
    if (!wasEnding) {
      callbacks.onFailed({ reason, hasStreamed });
    }
    callbacks.onClosed();
  }

  function finishClosing(): void {
    state = 'closed';
    stopPacing();
    clearTimeout(handshakeTimeout);
    if (endStreamCloseTimeout) {
      clearTimeout(endStreamCloseTimeout);
    }
    queuedFrames.length = 0;
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
      socket.close(NORMAL_CLOSE_CODE);
    }
  }

  function sendEndStream(): void {
    state = 'ending';
    stopPacing();
    socket.send(JSON.stringify({ type: 'endStream' }));
    endStreamCloseTimeout = setTimeout(() => {
      logger.warn('Meta did not close the transcription stream after endStream');
      finishClosing();
      callbacks.onClosed();
    }, CLOSE_AFTER_END_STREAM_TIMEOUT_MILLISECONDS);
  }

  function handleHandshakeResponse(messageText: string): void {
    const handshakeResponse = metaHandshakeResponseSchema.safeParse(JSON.parse(messageText));
    if (!handshakeResponse.success) {
      fail(`handshake rejected: ${messageText}`);
      return;
    }
    clearTimeout(handshakeTimeout);
    logger.info({ metaSessionId: handshakeResponse.data.sessionId }, 'transcription stream open');
    state = 'streaming';
    streamingStartedAtEpochMilliseconds = Date.now();
    for (const frame of queuedFrames.splice(0)) {
      socket.send(frame);
      audioSentBytes += frame.byteLength;
    }
    if (maximumAudioLagMilliseconds > 0) {
      pacingInterval = setInterval(padToRealTime, FRAME_DURATION_MILLISECONDS);
    }
    if (isEndRequested) {
      sendEndStream();
    }
  }

  function handleTranscriptionEvent(event: MetaTranscriptionEvent): void {
    switch (event.type) {
      case 'speechStart':
        callbacks.onSpeechStarted(event.turnId);
        return;
      case 'transcript':
        callbacks.onPartialTranscript(event.transcript);
        return;
      case 'speechEnd':
        callbacks.onSpeechEnded(
          event.turnId,
          calculateSpeechEndedAtEpochMilliseconds({
            speechEndAudioMilliseconds: event.audioProcessedMs,
            audioReceivedMilliseconds: calculateAudioDurationMilliseconds(audioReceivedBytes),
            lastAudioFrameReceivedAtEpochMilliseconds,
          }),
        );
        return;
      case 'speechComplete':
        callbacks.onFinalTranscript(event.turnId, event.transcript);
        return;
      case 'error':
        fail(`Meta error: ${event.message}`);
        return;
    }
  }

  socket.addEventListener('open', () => {
    // The key travels in the first text frame, not an HTTP header (D-005).
    socket.send(
      JSON.stringify({
        authorization: { accessToken: `Bearer ${metaApiKey}` },
        model: TRANSCRIPTION_MODEL_ID,
        audioEncoding: AUDIO_ENCODING,
        mode: 'ENDPOINTING',
        languageBias,
        ...(keywords.length > 0 ? { keywords } : {}),
        emitAudioProgress: false,
      }),
    );
  });

  socket.addEventListener('message', (messageEvent) => {
    if (state === 'closed' || typeof messageEvent.data !== 'string') {
      return;
    }
    try {
      if (state === 'connecting') {
        handleHandshakeResponse(messageEvent.data);
        return;
      }
      const transcriptionEvent = parseMetaTranscriptionEvent(messageEvent.data);
      if (transcriptionEvent) {
        handleTranscriptionEvent(transcriptionEvent);
      }
    } catch (error) {
      logger.error({ err: error, messageText: messageEvent.data }, 'unreadable Meta event');
    }
  });

  socket.addEventListener('close', (closeEvent) => {
    if (state === 'closed') {
      return;
    }
    // After endStream, Meta ends the connection without a close frame (1006). That's normal.
    if (state === 'ending') {
      logger.info(
        { closeCode: closeEvent.code, ...describePacing() },
        'transcription stream closed after endStream',
      );
      finishClosing();
      callbacks.onClosed();
      return;
    }
    fail(`closed by Meta: ${closeEvent.code} ${closeEvent.reason}`);
  });

  socket.addEventListener('error', () => {
    fail('could not reach Meta');
  });

  return {
    sendAudioFrame(frame) {
      if (state === 'ending' || state === 'closed') {
        return;
      }
      audioReceivedBytes += frame.byteLength;
      lastAudioFrameReceivedAtEpochMilliseconds = Date.now();

      if (state === 'streaming') {
        socket.send(frame);
        audioSentBytes += frame.byteLength;
        return;
      }
      queuedFrames.push(frame);
      const droppedFrame =
        queuedFrames.length > MAXIMUM_QUEUED_FRAME_COUNT ? queuedFrames.shift() : undefined;
      if (droppedFrame) {
        // Meta never hears it, so it doesn't count towards the audio position either.
        audioReceivedBytes -= droppedFrame.byteLength;
        logger.warn('transcription stream still connecting, dropped the oldest audio frame');
      }
    },

    end() {
      if (state === 'streaming') {
        sendEndStream();
      } else if (state === 'connecting') {
        isEndRequested = true;
      }
    },

    close() {
      if (state !== 'closed') {
        logger.info('transcription stream closed by the API');
        finishClosing();
      }
    },
  };
}
