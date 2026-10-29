import type { ErrorCode, LanguageCode, ServerMessage } from '@samvaad/shared';

export type CaptionTranslation = {
  targetLanguageCode: LanguageCode;
  text: string;
  isComplete: boolean;
  /** Speech end → whole translation received, once complete (D-011). */
  speechEndToTranslationCompleteMilliseconds: number | null;
};

export type Caption = {
  utteranceId: string;
  /** The transcript, in the language that was spoken. */
  text: string;
  /** A partial caption is still being spoken and will be replaced as it grows. */
  isFinal: boolean;
  translation: CaptionTranslation | null;
  hasTranslationFailed: boolean;
};

export type ConversationState = {
  participantId: string | null;
  captions: Caption[];
  latestError: { code: ErrorCode; message: string } | null;
};

export const INITIAL_CONVERSATION_STATE: ConversationState = {
  participantId: null,
  captions: [],
  latestError: null,
};

function createCaption(utteranceId: string, text: string, isFinal: boolean): Caption {
  return { utteranceId, text, isFinal, translation: null, hasTranslationFailed: false };
}

function upsertTranscript(
  captions: Caption[],
  { utteranceId, text, isFinal }: { utteranceId: string; text: string; isFinal: boolean },
): Caption[] {
  const existingCaption = captions.find((caption) => caption.utteranceId === utteranceId);
  if (!existingCaption) {
    return [...captions, createCaption(utteranceId, text, isFinal)];
  }
  // A late partial must not turn a finished caption back into a partial one.
  if (existingCaption.isFinal && !isFinal) {
    return captions;
  }
  return updateCaption(captions, utteranceId, (caption) => ({ ...caption, text, isFinal }));
}

function updateCaption(
  captions: Caption[],
  utteranceId: string,
  update: (caption: Caption) => Caption,
): Caption[] {
  return captions.map((caption) =>
    caption.utteranceId === utteranceId ? update(caption) : caption,
  );
}

export function reduceConversation(
  state: ConversationState,
  message: ServerMessage,
): ConversationState {
  switch (message.type) {
    case 'session_ready':
      return { ...state, participantId: message.participantId, latestError: null };

    // Speech coming through means the earlier problem is over.
    case 'transcript_partial':
    case 'transcript_final':
      return {
        ...state,
        latestError: null,
        captions: upsertTranscript(state.captions, {
          utteranceId: message.utteranceId,
          text: message.text,
          isFinal: message.type === 'transcript_final',
        }),
      };

    case 'translation_delta':
      return {
        ...state,
        captions: updateCaption(state.captions, message.utteranceId, (caption) => ({
          ...caption,
          translation: {
            targetLanguageCode: message.targetLanguageCode,
            text: (caption.translation?.text ?? '') + message.textDelta,
            isComplete: false,
            speechEndToTranslationCompleteMilliseconds: null,
          },
        })),
      };

    case 'translation_complete':
      return {
        ...state,
        captions: updateCaption(state.captions, message.utteranceId, (caption) => ({
          ...caption,
          translation: {
            targetLanguageCode: message.targetLanguageCode,
            text: message.text,
            isComplete: true,
            speechEndToTranslationCompleteMilliseconds:
              message.timings.translationCompleteAtEpochMilliseconds -
              message.timings.speechEndedAtEpochMilliseconds,
          },
        })),
      };

    case 'error': {
      // Frames still in flight when the mic closes; expected and harmless.
      if (message.code === 'MICROPHONE_NOT_OPEN') {
        return state;
      }
      // A problem with one utterance belongs on its bubble, not in the status line.
      const { utteranceId } = message;
      if (utteranceId !== undefined) {
        return {
          ...state,
          captions: updateCaption(state.captions, utteranceId, (caption) => ({
            ...caption,
            hasTranslationFailed: true,
          })),
        };
      }
      return { ...state, latestError: { code: message.code, message: message.message } };
    }
  }
}
