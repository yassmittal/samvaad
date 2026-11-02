import {
  type ConversationContext,
  EMPTY_CONVERSATION_CONTEXT,
  type ErrorCode,
  type IceServer,
  type LanguageCode,
  type RoomParticipant,
  type RoomPreviewMessage,
  type ServerMessage,
  type UtteranceReceipt,
} from '@samvaad/shared';

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
  /** This phone's own utterance: ✓ translated, ✓✓ heard on the other phone (D-022). */
  receipt: UtteranceReceipt | null;
};

export type ConversationRoomState = {
  roomCode: string;
  participants: RoomParticipant[];
};

/** After someone ends the conversation: the recap in each language this phone listens in (D-016). */
export type ConversationRecap = {
  /** `null` at a table. */
  endedByParticipantName: string | null;
  recapTextsByLanguageCode: Partial<Record<LanguageCode, string>>;
  hasFailed: boolean;
};

export type ConversationState = {
  participantId: string | null;
  /** `null` in table mode, and until the API answers `create_room` or `join_room`. */
  room: ConversationRoomState | null;
  /** Who left last, until someone joins again. */
  departedParticipantName: string | null;
  captions: Caption[];
  latestError: { code: ErrorCode; message: string } | null;
  /** The room's setting and glossary, as the API last told this phone (D-016). */
  conversationContext: ConversationContext;
  /** Who changed the context last, while this phone has been here. */
  contextUpdatedByParticipantName: string | null;
  /** `null` until someone ends the conversation, and again after "Back to the conversation". */
  recap: ConversationRecap | null;
  /** The API speaks translations itself (D-021), so this phone needs no voice of its own. */
  isTranslationAudioEnabled: boolean;
  /** Who is in the room this phone is about to join, for the incoming-call screen (D-022). */
  roomPreview: Pick<RoomPreviewMessage, 'roomCode' | 'participants'> | null;
  /** Where to look for the other phone, for the real voice; `null` until the API says (D-023). */
  iceServers: IceServer[] | null;
};

/** Not from the server: this phone started speaking an utterance's translation. */
export type PlaybackStartedEvent = {
  type: 'playback_started';
  utteranceId: string;
  speechEndToPlaybackStartMilliseconds: number;
};

/** Not from the server: this phone went back from the recap to the conversation. */
export type RecapDismissedEvent = { type: 'recap_dismissed' };

export type ConversationEvent = ServerMessage | PlaybackStartedEvent | RecapDismissedEvent;

export const INITIAL_CONVERSATION_STATE: ConversationState = {
  participantId: null,
  room: null,
  departedParticipantName: null,
  captions: [],
  latestError: null,
  conversationContext: EMPTY_CONVERSATION_CONTEXT,
  contextUpdatedByParticipantName: null,
  recap: null,
  isTranslationAudioEnabled: false,
  roomPreview: null,
  iceServers: null,
};

function startRecap(endedByParticipantName: string | null): ConversationRecap {
  return { endedByParticipantName, recapTextsByLanguageCode: {}, hasFailed: false };
}

type TranscriptUpdate = Pick<
  Caption,
  'utteranceId' | 'text' | 'isFinal' | 'isOwnUtterance' | 'languageCode'
>;

function upsertTranscript(captions: Caption[], update: TranscriptUpdate): Caption[] {
  const existingCaption = captions.find((caption) => caption.utteranceId === update.utteranceId);
  if (!existingCaption) {
    return [
      ...captions,
      { ...update, translation: null, hasTranslationFailed: false, receipt: null },
    ];
  }
  // A late partial must not turn a finished caption back into a partial one.
  if (existingCaption.isFinal && !update.isFinal) {
    return captions;
  }
  return updateCaption(captions, update.utteranceId, (caption) => ({ ...caption, ...update }));
}

/**
 * A finished caption whose translation this phone will hear: every one at a table (D-008); in
 * a room, the other person's, unless they spoke this phone's language.
 */
function isTranslatedForThisPhone(
  caption: Caption,
  listenerLanguageCode: LanguageCode | null,
): boolean {
  return (
    caption.isFinal &&
    (listenerLanguageCode === null ||
      (!caption.isOwnUtterance && caption.languageCode !== listenerLanguageCode))
  );
}

/** For the status line's "Translating…": the newest translation for this phone is on its way. */
export function isWaitingForTranslation(
  captions: Caption[],
  listenerLanguageCode: LanguageCode | null,
): boolean {
  const newestCaption = captions
    .filter((caption) => isTranslatedForThisPhone(caption, listenerLanguageCode))
    .at(-1);
  return (
    newestCaption !== undefined &&
    newestCaption.translation?.isComplete !== true &&
    !newestCaption.hasTranslationFailed
  );
}

/**
 * Back in the room after a dropped socket (D-017): the API doesn't translate for an empty seat,
 * so a translation still missing then never comes. Say so instead of "Translating…" forever.
 */
function markMissedTranslationsFailed(captions: Caption[]): Caption[] {
  return captions.map((caption) =>
    !caption.isOwnUtterance && caption.isFinal && caption.translation?.isComplete !== true
      ? { ...caption, hasTranslationFailed: true }
      : caption,
  );
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
      return {
        ...state,
        participantId: event.participantId,
        isTranslationAudioEnabled: event.isTranslationAudioEnabled,
        latestError: null,
      };

    case 'room_joined':
      return {
        ...state,
        participantId: event.participantId,
        isTranslationAudioEnabled: event.isTranslationAudioEnabled,
        // A rejoin keeps who's here until the next room_state, so the screen doesn't blink.
        room: { roomCode: event.roomCode, participants: state.room?.participants ?? [] },
        captions: markMissedTranslationsFailed(state.captions),
        latestError: null,
      };

    case 'room_state':
      return {
        ...state,
        room: { roomCode: event.roomCode, participants: event.participants },
        departedParticipantName:
          event.participants.length > 1 ? null : state.departedParticipantName,
      };

    case 'room_preview':
      return {
        ...state,
        roomPreview: { roomCode: event.roomCode, participants: event.participants },
      };

    // "Heard" never goes back to "translated", whatever order they arrive in.
    case 'utterance_receipt':
      return {
        ...state,
        captions: updateCaption(state.captions, event.utteranceId, (caption) => ({
          ...caption,
          receipt: caption.receipt === 'heard' ? 'heard' : event.receipt,
        })),
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

    // The audio itself never reaches the reducer; `useConversation` plays it (D-021).
    case 'translation_audio_end':
      return state;

    case 'ice_servers':
      return { ...state, iceServers: event.iceServers };

    // A step of the peer connection's setup, handled by `useOriginalVoice` (D-023).
    case 'webrtc_signal':
      return state;

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

    case 'conversation_context':
      return {
        ...state,
        conversationContext: { setting: event.setting, glossaryTerms: event.glossaryTerms },
        contextUpdatedByParticipantName:
          event.updatedByParticipantName ?? state.contextUpdatedByParticipantName,
      };

    case 'conversation_ended':
      return { ...state, recap: startRecap(event.participantName) };

    case 'conversation_recap': {
      const recap = state.recap ?? startRecap(null);
      return {
        ...state,
        recap: {
          ...recap,
          recapTextsByLanguageCode: {
            ...recap.recapTextsByLanguageCode,
            [event.languageCode]: event.text,
          },
        },
      };
    }

    case 'recap_dismissed':
      return { ...state, recap: null };

    case 'error': {
      // Frames still in flight when the mic closes; expected and harmless.
      if (event.code === 'MICROPHONE_NOT_OPEN') {
        return state;
      }
      // A recap that couldn't be written belongs on the recap screen, if it's open.
      if (event.code === 'RECAP_UNAVAILABLE' && state.recap !== null) {
        return { ...state, recap: { ...state.recap, hasFailed: true } };
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
