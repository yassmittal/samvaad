import type { ErrorCode, ServerMessage } from '@samvaad/shared';

export type Caption = {
  utteranceId: string;
  text: string;
  /** A partial caption is still being spoken and will be replaced as it grows. */
  isFinal: boolean;
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

function upsertCaption(captions: Caption[], updatedCaption: Caption): Caption[] {
  const existingIndex = captions.findIndex(
    (caption) => caption.utteranceId === updatedCaption.utteranceId,
  );
  if (existingIndex === -1) {
    return [...captions, updatedCaption];
  }
  // A late partial must not turn a finished caption back into a partial one.
  if (captions[existingIndex]?.isFinal && !updatedCaption.isFinal) {
    return captions;
  }
  return captions.map((caption, index) => (index === existingIndex ? updatedCaption : caption));
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
      return {
        ...state,
        latestError: null,
        captions: upsertCaption(state.captions, {
          utteranceId: message.utteranceId,
          text: message.text,
          isFinal: false,
        }),
      };
    case 'transcript_final':
      return {
        ...state,
        latestError: null,
        captions: upsertCaption(state.captions, {
          utteranceId: message.utteranceId,
          text: message.text,
          isFinal: true,
        }),
      };
    case 'error':
      // Frames still in flight when the mic closes; expected and harmless.
      if (message.code === 'MICROPHONE_NOT_OPEN') {
        return state;
      }
      return { ...state, latestError: { code: message.code, message: message.message } };
  }
}
