import type { LanguageCode, ServerMessage } from '@samvaad/shared';
import { type ConversationUtterance, selectConversationMemory } from '../lib/conversation-memory';
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
import { findConnectedParticipants, findListeners } from './room-messages';

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

/** Keeps each finished translation with its utterance, for the next prompts' memory (D-016). */
async function* rememberTranslation(
  conversationUtterance: ConversationUtterance,
  messages: AsyncGenerator<ServerMessage>,
): AsyncGenerator<ServerMessage> {
  for await (const message of messages) {
    if (message.type === 'translation_complete') {
      conversationUtterance.translationsByLanguageCode[message.targetLanguageCode] = message.text;
    }
    yield message;
  }
}

/**
 * Translates one finished utterance once per listener language in the room (D-006, D-015),
 * or into the table's other language (D-008), with the room's context and the conversation so
 * far (D-016). Each starts at once; delivery keeps the order.
 */
export function startUtteranceTranslations(
  speaker: ConversationConnection,
  { room, languageCodes, participantName }: RoomMembership,
  utterance: UtteranceToTranslate,
): void {
  const earlierUtterances = [...room.utterances];
  const conversationUtterance: ConversationUtterance = {
    utteranceId: utterance.utteranceId,
    speakerName: participantName,
    languageCode: languageCodes.length === 1 ? languageCodes[0] : null,
    transcript: utterance.utteranceText,
    translationsByLanguageCode: {},
  };
  room.utterances.push(conversationUtterance);

  const plans = planUtteranceTranslations({
    speakerLanguageCodes: languageCodes,
    // A seat kept for a dropped phone gets nothing translated meanwhile (D-017).
    roomLanguageCodes: findConnectedParticipants(room).flatMap((participant) =>
      participant.membership ? [participant.membership.languageCodes] : [],
    ),
  });

  for (const plan of plans) {
    const candidateTargetLanguageCodes = findCandidateTargetLanguageCodes(plan);
    const translationJob = { candidateTargetLanguageCodes, abortController: new AbortController() };
    room.translationJobs.add(translationJob);

    void findOrCreateTranslationDelivery(room, speaker.participantId, candidateTargetLanguageCodes)
      .run(() =>
        rememberTranslation(
          conversationUtterance,
          produceTranslationMessages({
            translationClient: speaker.translationClient,
            logger: speaker.logger,
            utterance,
            plan,
            promptContext: {
              context: room.context,
              speakerName: participantName,
              memoryUtterances: selectConversationMemory({
                earlierUtterances,
                candidateTargetLanguageCodes,
              }),
            },
            signal: translationJob.abortController.signal,
          }),
        ),
      )
      .finally(() => room.translationJobs.delete(translationJob));
  }
}
