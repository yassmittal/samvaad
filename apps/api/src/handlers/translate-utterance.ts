import { encodeTranslationAudioFrame, type LanguageCode } from '@samvaad/shared';
import { type ConversationUtterance, selectConversationMemory } from '../lib/conversation-memory';
import { createOrderedDelivery, type OrderedDelivery } from '../lib/create-ordered-delivery';
import {
  findCandidateTargetLanguageCodes,
  planUtteranceTranslations,
} from '../lib/plan-utterance-translations';
import type { TranslationOutput } from '../lib/translation-output';
import type {
  ConversationConnection,
  ConversationRoom,
  RoomMembership,
} from './conversation-connection';
import { addTranslationAudio } from './produce-translation-audio';
import {
  produceTranslationMessages,
  type UtteranceToTranslate,
} from './produce-translation-messages';
import { findConnectedParticipants, findListeners } from './room-messages';

/**
 * The speaker's ✓: their utterance's translation reached a listener (D-022). Not at a table,
 * where the speaker is also the listener.
 */
function sendTranslatedReceipt(
  room: ConversationRoom,
  speakerParticipantId: string,
  listeners: readonly ConversationConnection[],
  utteranceId: string,
): void {
  const speaker = room.participants.get(speakerParticipantId);
  if (speaker === undefined || listeners.includes(speaker) || listeners.length === 0) {
    return;
  }
  speaker.sendServerMessage({ type: 'utterance_receipt', utteranceId, receipt: 'translated' });
}

/** Sends one piece of a translation to everyone listening in its language, as it is delivered. */
function sendToListeners(
  room: ConversationRoom,
  speakerParticipantId: string,
  candidateTargetLanguageCodes: readonly LanguageCode[],
  output: TranslationOutput,
): void {
  const listeners = findListeners(room, candidateTargetLanguageCodes);
  if (output.type === 'translation_complete') {
    sendTranslatedReceipt(room, speakerParticipantId, listeners, output.utteranceId);
  }
  if (output.type === 'translation_audio_chunk') {
    // Encoded once, sent to every listener in the language (D-021).
    const frame = encodeTranslationAudioFrame(output);
    for (const listener of listeners) {
      listener.sendBinaryFrame(frame);
    }
    return;
  }
  for (const listener of listeners) {
    listener.sendServerMessage(output);
    if (output.type === 'translation_complete') {
      listener.playbackTimings.remember(output.utteranceId, output.timings);
    }
  }
}

/** One per speaker and target: a later utterance never overtakes an earlier, slower one. */
function findOrCreateTranslationDelivery(
  room: ConversationRoom,
  speakerParticipantId: string,
  candidateTargetLanguageCodes: readonly LanguageCode[],
): OrderedDelivery<TranslationOutput> {
  const deliveryKey = `${speakerParticipantId} into ${candidateTargetLanguageCodes.join(' or ')}`;
  const existingDelivery = room.translationDeliveries.get(deliveryKey);
  if (existingDelivery) {
    return existingDelivery;
  }
  const delivery = createOrderedDelivery<TranslationOutput>((output) =>
    sendToListeners(room, speakerParticipantId, candidateTargetLanguageCodes, output),
  );
  room.translationDeliveries.set(deliveryKey, delivery);
  return delivery;
}

/**
 * The voice a speaker's translations are spoken in: the room's first participant gets the first
 * of `SPEECH_VOICE_IDS`, the second the second, so the two people sound different (D-021).
 */
function findSpeakerVoiceId(
  room: ConversationRoom,
  speaker: ConversationConnection,
): string | null {
  const voiceIds = speaker.speechSynthesisClient?.voiceIds ?? [];
  const speakerIndex = Math.max(0, [...room.participants.keys()].indexOf(speaker.participantId));
  return voiceIds[speakerIndex % voiceIds.length] ?? null;
}

/** Keeps each finished translation with its utterance, for the next prompts' memory (D-016). */
async function* rememberTranslation(
  conversationUtterance: ConversationUtterance,
  messages: AsyncGenerator<TranslationOutput>,
): AsyncGenerator<TranslationOutput> {
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
    speakerParticipantId: speaker.participantId,
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

    const { signal } = translationJob.abortController;
    void findOrCreateTranslationDelivery(room, speaker.participantId, candidateTargetLanguageCodes)
      .run(() =>
        addTranslationAudio(
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
              signal,
            }),
          ),
          {
            speechSynthesisClient: speaker.speechSynthesisClient,
            voiceId: findSpeakerVoiceId(room, speaker),
            logger: speaker.logger,
            signal,
          },
        ),
      )
      .finally(() => room.translationJobs.delete(translationJob));
  }
}
