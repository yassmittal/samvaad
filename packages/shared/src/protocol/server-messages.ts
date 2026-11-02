import { z } from 'zod';
import { conversationContextSchema } from '../domain/conversation-context';
import { errorCodeSchema } from '../domain/error-code';
import { roomCodeSchema } from '../domain/room-code';
import { languageCodeSchema } from '../languages/supported-languages';
import { webrtcIceCandidateSchema, webrtcSessionDescriptionSchema } from './client-messages';

/** API → browser, as JSON text frames. */

/**
 * The close code the API uses when another socket took this one's seat (D-017): the same room
 * opened in a duplicated tab, or a phone whose old socket was still open. The browser doesn't
 * reconnect on its own, or two tabs would take the seat from each other forever.
 */
export const SEAT_TAKEN_OVER_CLOSE_CODE = 4001;

/**
 * Whether the API speaks translations itself, as audio frames after `translation_complete`
 * (D-021). When `false`, each phone speaks them with its own browser voice (D-007).
 */
const isTranslationAudioEnabledSchema = z.boolean();

export const sessionReadyMessageSchema = z.object({
  type: z.literal('session_ready'),
  participantId: z.string(),
  languageCodes: z.tuple([languageCodeSchema, languageCodeSchema]),
  isTranslationAudioEnabled: isTranslationAudioEnabledSchema,
});

/** Sent to the phone that created or joined a room: you are this participant. */
export const roomJoinedMessageSchema = z.object({
  type: z.literal('room_joined'),
  roomCode: roomCodeSchema,
  participantId: z.string(),
  isTranslationAudioEnabled: isTranslationAudioEnabledSchema,
});

export const roomParticipantSchema = z.object({
  participantId: z.string(),
  participantName: z.string(),
  languageCode: languageCodeSchema,
  isMicrophoneOpen: z.boolean(),
  /** `false` while the room keeps the seat of a phone whose socket dropped (D-017). */
  isConnected: z.boolean(),
});

/** Who is in the room. Sent to everyone whenever someone joins, leaves or turns their mic on or off. */
export const roomStateMessageSchema = z.object({
  type: z.literal('room_state'),
  roomCode: roomCodeSchema,
  participants: z.array(roomParticipantSchema),
});

/** The answer to `preview_room`: who is in the room, before this phone joins it (D-022). */
export const roomPreviewMessageSchema = z.object({
  type: z.literal('room_preview'),
  roomCode: roomCodeSchema,
  participants: z.array(roomParticipantSchema.pick({ participantName: true, languageCode: true })),
});

/**
 * Tells the speaker what became of one of their utterances (D-022): `translated` once its
 * translation reached the other phone, `heard` once that phone started speaking it.
 */
export const utteranceReceiptMessageSchema = z.object({
  type: z.literal('utterance_receipt'),
  utteranceId: z.string(),
  receipt: z.enum(['translated', 'heard']),
});

/** One STUN or TURN server for the peer connection, as `RTCIceServer` describes it (D-023). */
export const iceServerSchema = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
});

/** Where the phones of a room look for each other, sent after `room_joined` (D-023). */
export const iceServersMessageSchema = z.object({
  type: z.literal('ice_servers'),
  iceServers: z.array(iceServerSchema),
});

/** The other participant's part of setting up the peer-to-peer audio (D-023). */
export const webrtcSignalServerMessageSchema = z.object({
  type: z.literal('webrtc_signal'),
  fromParticipantId: z.string(),
  description: webrtcSessionDescriptionSchema.optional(),
  candidate: webrtcIceCandidateSchema.optional(),
});

/** Someone left the room, or their socket closed and they didn't come back in time (D-017). */
export const participantLeftMessageSchema = z.object({
  type: z.literal('participant_left'),
  participantId: z.string(),
  participantName: z.string(),
});

/** The growing transcript of the utterance being spoken. Sent to the speaker only. */
export const transcriptPartialMessageSchema = z.object({
  type: z.literal('transcript_partial'),
  utteranceId: z.string(),
  text: z.string(),
});

/** A finished utterance. Sent to everyone in the room. */
export const transcriptFinalMessageSchema = z.object({
  type: z.literal('transcript_final'),
  utteranceId: z.string(),
  speakerParticipantId: z.string(),
  /**
   * The speaker's language in a room (D-015). `null` in table mode: the transcriber doesn't
   * report which of the table's two languages was spoken (D-008).
   */
  languageCode: languageCodeSchema.nullable(),
  text: z.string(),
  speechEndedAtEpochMilliseconds: z.number(),
});

/** Part of an utterance's translation, as it streams in. Sent to each listener in that language. */
export const translationDeltaMessageSchema = z.object({
  type: z.literal('translation_delta'),
  utteranceId: z.string(),
  targetLanguageCode: languageCodeSchema,
  textDelta: z.string(),
});

/** When each step of one utterance happened, for the latency meter (D-011). */
export const utteranceTimingsSchema = z.object({
  speechEndedAtEpochMilliseconds: z.number(),
  transcriptFinalAtEpochMilliseconds: z.number(),
  firstTranslationDeltaAtEpochMilliseconds: z.number(),
  translationCompleteAtEpochMilliseconds: z.number(),
});

/**
 * The whole translation. When `hasTranslationAudio`, its speech follows as binary audio frames
 * and `translation_audio_end` (D-021); otherwise the listener's browser speaks the text (D-007).
 */
export const translationCompleteMessageSchema = z.object({
  type: z.literal('translation_complete'),
  utteranceId: z.string(),
  targetLanguageCode: languageCodeSchema,
  text: z.string(),
  timings: utteranceTimingsSchema,
  hasTranslationAudio: z.boolean(),
});

/**
 * The last audio frame of a spoken translation has been sent (D-021). `hasFailed` means the
 * speech couldn't be made, or stopped part way: the phone speaks the text with its own voice.
 */
export const translationAudioEndMessageSchema = z.object({
  type: z.literal('translation_audio_end'),
  utteranceId: z.string(),
  hasFailed: z.boolean(),
});

/** The room's setting and glossary (D-016). To everyone on every change, and to a phone that joins. */
export const conversationContextMessageSchema = z.object({
  type: z.literal('conversation_context'),
  ...conversationContextSchema.shape,
  /** Who changed it just now. `null` when it is sent to a phone joining, and at a table. */
  updatedByParticipantName: z.string().nullable(),
});

/** Someone ended the conversation. Every phone closes its mic; the recaps follow (D-016). */
export const conversationEndedMessageSchema = z.object({
  type: z.literal('conversation_ended'),
  /** `null` at a table. */
  participantName: z.string().nullable(),
});

/** The end-of-conversation recap in one language, to the participants listening in it. */
export const conversationRecapMessageSchema = z.object({
  type: z.literal('conversation_recap'),
  languageCode: languageCodeSchema,
  text: z.string(),
});

export const errorMessageSchema = z.object({
  type: z.literal('error'),
  code: errorCodeSchema,
  message: z.string(),
  /** Set when the problem concerns one utterance only, such as a failed translation. */
  utteranceId: z.string().optional(),
});

export const serverMessageSchema = z.discriminatedUnion('type', [
  sessionReadyMessageSchema,
  roomJoinedMessageSchema,
  roomStateMessageSchema,
  roomPreviewMessageSchema,
  utteranceReceiptMessageSchema,
  iceServersMessageSchema,
  webrtcSignalServerMessageSchema,
  participantLeftMessageSchema,
  transcriptPartialMessageSchema,
  transcriptFinalMessageSchema,
  translationDeltaMessageSchema,
  translationCompleteMessageSchema,
  translationAudioEndMessageSchema,
  conversationContextMessageSchema,
  conversationEndedMessageSchema,
  conversationRecapMessageSchema,
  errorMessageSchema,
]);

export type SessionReadyMessage = z.infer<typeof sessionReadyMessageSchema>;
export type RoomJoinedMessage = z.infer<typeof roomJoinedMessageSchema>;
export type RoomParticipant = z.infer<typeof roomParticipantSchema>;
export type RoomStateMessage = z.infer<typeof roomStateMessageSchema>;
export type RoomPreviewMessage = z.infer<typeof roomPreviewMessageSchema>;
export type UtteranceReceiptMessage = z.infer<typeof utteranceReceiptMessageSchema>;
export type UtteranceReceipt = UtteranceReceiptMessage['receipt'];
export type IceServer = z.infer<typeof iceServerSchema>;
export type IceServersMessage = z.infer<typeof iceServersMessageSchema>;
export type WebrtcSignalServerMessage = z.infer<typeof webrtcSignalServerMessageSchema>;
export type ParticipantLeftMessage = z.infer<typeof participantLeftMessageSchema>;
export type TranscriptPartialMessage = z.infer<typeof transcriptPartialMessageSchema>;
export type TranscriptFinalMessage = z.infer<typeof transcriptFinalMessageSchema>;
export type TranslationDeltaMessage = z.infer<typeof translationDeltaMessageSchema>;
export type UtteranceTimings = z.infer<typeof utteranceTimingsSchema>;
export type TranslationCompleteMessage = z.infer<typeof translationCompleteMessageSchema>;
export type TranslationAudioEndMessage = z.infer<typeof translationAudioEndMessageSchema>;
export type ConversationContextMessage = z.infer<typeof conversationContextMessageSchema>;
export type ConversationEndedMessage = z.infer<typeof conversationEndedMessageSchema>;
export type ConversationRecapMessage = z.infer<typeof conversationRecapMessageSchema>;
export type ErrorMessage = z.infer<typeof errorMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
