import type { ServerMessage } from '@samvaad/shared';

/** Part of a spoken translation, sent to the listener as a binary frame, not JSON (D-021). */
export type TranslationAudioChunk = {
  type: 'translation_audio_chunk';
  utteranceId: string;
  /** PCM16, whole samples. */
  audio: Uint8Array;
};

/** What one translation job delivers to its listeners, in order. */
export type TranslationOutput = ServerMessage | TranslationAudioChunk;
