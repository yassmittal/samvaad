import type { LanguageCode, ServerMessage } from '@samvaad/shared';
import { createOrderedDelivery, type OrderedDelivery } from '../lib/create-ordered-delivery';
import {
  findCandidateTargetLanguageCodes,
  planUtteranceTranslations,
} from '../lib/plan-utterance-translations';
import type {
  ConversationConnection,
  ConversationRoom,
  RoomMembership,
} from './conversation-connection';
import {
  produceTranslationMessages,
  type UtteranceToTranslate,
} from './produce-translation-messages';
import { findListeners } from './room-messages';

/** Sends one translation message to everyone listening in its language, as it is delivered. */
function sendToListeners(
  room: ConversationRoom,
  candidateTargetLanguageCodes: readonly LanguageCode[],
  message: ServerMessage,
): void {
  for (const listener of findListeners(room, candidateTargetLanguageCodes)) {
    listener.sendServerMessage(message);
    if (message.type === 'translation_complete') {
      listener.playbackTimings.remember(message.utteranceId, message.timings);
    }
  }
}

/** One per speaker and target: a later utterance never overtakes an earlier, slower one. */
function findOrCreateTranslationDelivery(
  room: ConversationRoom,
  speakerParticipantId: string,
  candidateTargetLanguageCodes: readonly LanguageCode[],
): OrderedDelivery<ServerMessage> {
  const deliveryKey = `${speakerParticipantId} into ${candidateTargetLanguageCodes.join(' or ')}`;
  const existingDelivery = room.translationDeliveries.get(deliveryKey);
  if (existingDelivery) {
    return existingDelivery;
  }
  const delivery = createOrderedDelivery<ServerMessage>((message) =>
    sendToListeners(room, candidateTargetLanguageCodes, message),
  );
  room.translationDeliveries.set(deliveryKey, delivery);
  return delivery;
}

/**
 * Translates one finished utterance once per listener language in the room (D-006, D-015),
 * or into the table's other language (D-008). Each starts at once; delivery keeps the order.
 */
export function startUtteranceTranslations(
  speaker: ConversationConnection,
  { room, languageCodes }: RoomMembership,
  utterance: UtteranceToTranslate,
): void {
  const plans = planUtteranceTranslations({
    speakerLanguageCodes: languageCodes,
    roomLanguageCodes: [...room.participants.values()].flatMap((participant) =>
      participant.membership ? [participant.membership.languageCodes] : [],
    ),
  });

  for (const plan of plans) {
    const candidateTargetLanguageCodes = findCandidateTargetLanguageCodes(plan);
    const translationJob = { candidateTargetLanguageCodes, abortController: new AbortController() };
    room.translationJobs.add(translationJob);

    void findOrCreateTranslationDelivery(room, speaker.participantId, candidateTargetLanguageCodes)
      .run(() =>
        produceTranslationMessages({
          translationClient: speaker.translationClient,
          logger: speaker.logger,
          utterance,
          plan,
          signal: translationJob.abortController.signal,
        }),
      )
      .finally(() => room.translationJobs.delete(translationJob));
  }
}
