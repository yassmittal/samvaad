import { BYTES_PER_SAMPLE, FRAME_DURATION_MILLISECONDS, SAMPLE_RATE_HERTZ } from '@samvaad/shared';
import type { FastifyBaseLogger } from 'fastify';
import { calculateSpeechEndedAtEpochMilliseconds } from '../lib/calculate-speech-ended-at';
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
  /** The stream broke before it was asked to end. Nothing more will arrive. */
  onFailed: (reason: string) => void;
  /** The upstream socket is gone, for any reason. Always the last callback. */
  onClosed: () => void;
};

type MetaTranscriptionStreamOptions = {
  transcriptionUrl: string;
  metaApiKey: string;
  /** English language names, such as `["Hindi", "English"]` (D-005). */
  languageBias: string[];
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

  const handshakeTimeout = setTimeout(() => {
    fail(`no handshake response within ${HANDSHAKE_RESPONSE_TIMEOUT_MILLISECONDS} ms`);
  }, HANDSHAKE_RESPONSE_TIMEOUT_MILLISECONDS);
  let endStreamCloseTimeout: ReturnType<typeof setTimeout> | null = null;

  function fail(reason: string): void {
    if (state === 'closed') {
      return;
    }
    logger.warn({ reason }, 'transcription stream failed');
    const wasEnding = state === 'ending';
    finishClosing();
    if (!wasEnding) {
      callbacks.onFailed(reason);
    }
    callbacks.onClosed();
  }

  function finishClosing(): void {
    state = 'closed';
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
    for (const frame of queuedFrames.splice(0)) {
      socket.send(frame);
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
      logger.info({ closeCode: closeEvent.code }, 'transcription stream closed after endStream');
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
