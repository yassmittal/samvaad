import type { ErrorCode, LanguageCode, RoomParticipant, ServerMessage } from '@samvaad/shared';

export type CaptionTranslation = {
  targetLanguageCode: LanguageCode;
  text: string;
  isComplete: boolean;
  /** Speech end → whole translation received, once complete (D-011). */
  speechEndToTranslationCompleteMilliseconds: number | null;
  /** Speech end → this phone started speaking it, once spoken (D-011). */
  speechEndToPlaybackStartMilliseconds: number | null;
};

export type Caption = {
  utteranceId: string;
  /** The transcript, in the language that was spoken. */
  text: string;
  /** A partial caption is still being spoken and will be replaced as it grows. */
  isFinal: boolean;
  /**
   * Spoken into this phone. Decided on arrival, so it stays right if a reconnect gives this
   * phone a new participant id. Partials only ever come from this phone's own speech.
   */
  isOwnUtterance: boolean;
  /** The language spoken, known in a room (D-015); `null` at a table (D-008). */
  languageCode: LanguageCode | null;
  translation: CaptionTranslation | null;
  hasTranslationFailed: boolean;
};

export type ConversationRoomState = {
  roomCode: string;
  participants: RoomParticipant[];
};

export type ConversationState = {
  participantId: string | null;
  /** `null` in table mode, and until the API answers `create_room` or `join_room`. */
  room: ConversationRoomState | null;
  /** Who left last, until someone joins again. */
  departedParticipantName: string | null;
  captions: Caption[];
  latestError: { code: ErrorCode; message: string } | null;
};

/** Not from the server: this phone started speaking an utterance's translation. */
export type PlaybackStartedEvent = {
  type: 'playback_started';
  utteranceId: string;
  speechEndToPlaybackStartMilliseconds: number;
};

export type ConversationEvent = ServerMessage | PlaybackStartedEvent;

export const INITIAL_CONVERSATION_STATE: ConversationState = {
  participantId: null,
  room: null,
  departedParticipantName: null,
  captions: [],
  latestError: null,
};

type TranscriptUpdate = Pick<
  Caption,
  'utteranceId' | 'text' | 'isFinal' | 'isOwnUtterance' | 'languageCode'
>;

function upsertTranscript(captions: Caption[], update: TranscriptUpdate): Caption[] {
  const existingCaption = captions.find((caption) => caption.utteranceId === update.utteranceId);
  if (!existingCaption) {
    return [...captions, { ...update, translation: null, hasTranslationFailed: false }];
  }
  // A late partial must not turn a finished caption back into a partial one.
  if (existingCaption.isFinal && !update.isFinal) {
    return captions;
  }
  return updateCaption(captions, update.utteranceId, (caption) => ({ ...caption, ...update }));
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
  event: ConversationEvent,
): ConversationState {
  switch (event.type) {
    case 'session_ready':
      return { ...state, participantId: event.participantId, latestError: null };

    case 'room_joined':
      return {
        ...state,
        participantId: event.participantId,
        room: { roomCode: event.roomCode, participants: [] },
        latestError: null,
      };

    case 'room_state':
      return {
        ...state,
        room: { roomCode: event.roomCode, participants: event.participants },
        departedParticipantName:
          event.participants.length > 1 ? null : state.departedParticipantName,
      };

    case 'participant_left':
      return { ...state, departedParticipantName: event.participantName };

    // Speech coming through means the earlier problem is over.
    case 'transcript_partial':
      return {
        ...state,
        latestError: null,
        captions: upsertTranscript(state.captions, {
          utteranceId: event.utteranceId,
          text: event.text,
          isFinal: false,
          isOwnUtterance: true,
          languageCode: null,
        }),
      };

    case 'transcript_final':
      return {
        ...state,
        latestError: null,
        captions: upsertTranscript(state.captions, {
          utteranceId: event.utteranceId,
          text: event.text,
          isFinal: true,
          isOwnUtterance: event.speakerParticipantId === state.participantId,
          languageCode: event.languageCode,
        }),
      };

    case 'translation_delta':
      return {
        ...state,
        captions: updateCaption(state.captions, event.utteranceId, (caption) => ({
          ...caption,
          translation: {
            targetLanguageCode: event.targetLanguageCode,
            text: (caption.translation?.text ?? '') + event.textDelta,
            isComplete: false,
            speechEndToTranslationCompleteMilliseconds: null,
            speechEndToPlaybackStartMilliseconds: null,
          },
        })),
      };

    case 'translation_complete':
      return {
        ...state,
        captions: updateCaption(state.captions, event.utteranceId, (caption) => ({
          ...caption,
          translation: {
            targetLanguageCode: event.targetLanguageCode,
            text: event.text,
            isComplete: true,
            speechEndToTranslationCompleteMilliseconds:
              event.timings.translationCompleteAtEpochMilliseconds -
              event.timings.speechEndedAtEpochMilliseconds,
            speechEndToPlaybackStartMilliseconds: null,
          },
        })),
      };

    case 'playback_started':
      return {
        ...state,
        captions: updateCaption(state.captions, event.utteranceId, (caption) =>
          caption.translation
            ? {
                ...caption,
                translation: {
                  ...caption.translation,
                  speechEndToPlaybackStartMilliseconds: event.speechEndToPlaybackStartMilliseconds,
                },
              }
            : caption,
        ),
      };

    case 'error': {
      // Frames still in flight when the mic closes; expected and harmless.
      if (event.code === 'MICROPHONE_NOT_OPEN') {
        return state;
      }
      // A problem with one utterance belongs on its bubble, not in the status line.
      const { utteranceId } = event;
      if (utteranceId !== undefined) {
        return {
          ...state,
          captions: updateCaption(state.captions, utteranceId, (caption) => ({
            ...caption,
            hasTranslationFailed: true,
          })),
        };
      }
      return { ...state, latestError: { code: event.code, message: event.message } };
    }
  }
}
