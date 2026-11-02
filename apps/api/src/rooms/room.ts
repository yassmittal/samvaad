import {
  type ConversationContext,
  EMPTY_CONVERSATION_CONTEXT,
  type LanguageCode,
} from '@samvaad/shared';
import type { ConversationUtterance } from '../lib/conversation-memory';
import type { OrderedDelivery } from '../lib/create-ordered-delivery';
import type { TranslationOutput } from '../lib/translation-output';

/** One translation still streaming, kept so it can be cancelled when nobody can receive it. */
export type TranslationJob = {
  /** The languages it may come out in: one in a room, either of the two at a table. */
  candidateTargetLanguageCodes: readonly LanguageCode[];
  abortController: AbortController;
};

/** A conversation space, in memory only (D-004). */
export type Room<Participant> = {
  /** `null` for a table-mode room (D-008), which isn't in the registry, so nobody can join it. */
  roomCode: string | null;
  participants: Map<string, Participant>;
  /** Translations belong to the room, so a speaker leaving doesn't cancel their last one. */
  translationJobs: Set<TranslationJob>;
  /** One per speaker and target language, so each listener hears that speaker in order. */
  translationDeliveries: Map<string, OrderedDelivery<TranslationOutput>>;
  /** The setting and glossary; either participant can change it (D-016). */
  context: ConversationContext;
  /** Every finished utterance, oldest first, for translation memory and the recap (D-016). */
  utterances: ConversationUtterance[];
  /** Set while the recaps are being written, so a second tap doesn't pay for them twice. */
  isWritingRecap: boolean;
  /** For `MAX_ROOM_DURATION_MINUTES` (D-017). */
  createdAtEpochMilliseconds: number;
  /** Set once the time limit closed the room's microphones; they stay closed (D-017). */
  hasReachedTimeLimit: boolean;
};

export function createEmptyRoom<Participant>(roomCode: string | null): Room<Participant> {
  return {
    roomCode,
    participants: new Map(),
    translationJobs: new Set(),
    translationDeliveries: new Map(),
    context: EMPTY_CONVERSATION_CONTEXT,
    utterances: [],
    isWritingRecap: false,
    createdAtEpochMilliseconds: Date.now(),
    hasReachedTimeLimit: false,
  };
}

/** Table mode is a room with one participant who has two languages (D-008). */
export function createTableRoom<Participant extends { participantId: string }>(
  participant: Participant,
): Room<Participant> {
  const room = createEmptyRoom<Participant>(null);
  room.participants.set(participant.participantId, participant);
  return room;
}
