import type { LanguageCode, ServerMessage } from '@samvaad/shared';
import { buildTableModeTranslationPrompt } from '../lib/build-translation-prompt';
import {
  createTargetLanguageLineParser,
  type ParsedTranslationDelta,
} from '../lib/target-language-line-parser';
import type { ConversationConnection } from './conversation-connection';

type UtteranceToTranslate = {
  utteranceId: string;
  utteranceText: string;
  speechEndedAtEpochMilliseconds: number;
  transcriptFinalAtEpochMilliseconds: number;
};

/**
 * Translates one finished utterance into the other language of the table (D-006, D-008).
 * Starts at once; `translationDelivery` keeps the messages in utterance order.
 */
export function startUtteranceTranslation(
  connection: ConversationConnection,
  utterance: UtteranceToTranslate,
): void {
  const languageCodes = connection.tableSessionLanguageCodes;
  if (languageCodes === null) {
    return;
  }
  const abortController = new AbortController();
  connection.translationAbortControllers.add(abortController);

  void connection.translationDelivery
    .run(() =>
      produceTranslationMessages({
        connection,
        utterance,
        languageCodes,
        signal: abortController.signal,
      }),
    )
    .finally(() => connection.translationAbortControllers.delete(abortController));
}

async function* produceTranslationMessages({
  connection,
  utterance,
  languageCodes,
  signal,
}: {
  connection: ConversationConnection;
  utterance: UtteranceToTranslate;
  languageCodes: [LanguageCode, LanguageCode];
  signal: AbortSignal;
}): AsyncGenerator<ServerMessage> {
  const { utteranceId } = utterance;
  const targetLanguageLineParser = createTargetLanguageLineParser({
    languageCodes,
    fallbackLanguageCode: languageCodes[1],
  });
  let targetLanguageCode: LanguageCode | null = null;
  let translationText = '';
  let firstTranslationDeltaAtEpochMilliseconds: number | null = null;

  function* toDeltaMessages(parsedDelta: ParsedTranslationDelta | null): Generator<ServerMessage> {
    if (parsedDelta === null) {
      return;
    }
    targetLanguageCode = parsedDelta.targetLanguageCode;
    if (parsedDelta.textDelta.length === 0) {
      return;
    }
    firstTranslationDeltaAtEpochMilliseconds ??= Date.now();
    translationText += parsedDelta.textDelta;
    yield {
      type: 'translation_delta',
      utteranceId,
      targetLanguageCode: parsedDelta.targetLanguageCode,
      textDelta: parsedDelta.textDelta,
    };
  }

  try {
    const textDeltas = connection.translationClient.streamTranslation({
      systemPrompt: buildTableModeTranslationPrompt(languageCodes),
      utteranceText: utterance.utteranceText,
      signal,
    });
    for await (const textDelta of textDeltas) {
      yield* toDeltaMessages(targetLanguageLineParser.push(textDelta));
    }
    yield* toDeltaMessages(targetLanguageLineParser.finish());
  } catch (error) {
    if (signal.aborted) {
      return;
    }
    connection.logger.warn({ err: error, utteranceId }, 'translation failed');
    yield {
      type: 'error',
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'This sentence could not be translated.',
      utteranceId,
    };
    return;
  }

  if (targetLanguageLineParser.hasUsedFallback()) {
    connection.logger.warn({ utteranceId }, 'translation had no target language line');
  }
  if (targetLanguageCode === null || firstTranslationDeltaAtEpochMilliseconds === null) {
    yield {
      type: 'error',
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'The translation came back empty.',
      utteranceId,
    };
    return;
  }

  const translationCompleteAtEpochMilliseconds = Date.now();
  connection.logger.info(
    {
      utteranceId,
      speechEndToTranslationCompleteMilliseconds:
        translationCompleteAtEpochMilliseconds - utterance.speechEndedAtEpochMilliseconds,
      transcriptFinalToFirstTranslationDeltaMilliseconds:
        firstTranslationDeltaAtEpochMilliseconds - utterance.transcriptFinalAtEpochMilliseconds,
    },
    'translation complete',
  );
  const timings = {
    speechEndedAtEpochMilliseconds: utterance.speechEndedAtEpochMilliseconds,
    transcriptFinalAtEpochMilliseconds: utterance.transcriptFinalAtEpochMilliseconds,
    firstTranslationDeltaAtEpochMilliseconds,
    translationCompleteAtEpochMilliseconds,
  };
  connection.playbackTimings.remember(utteranceId, timings);
  yield {
    type: 'translation_complete',
    utteranceId,
    targetLanguageCode,
    text: translationText.trim(),
    timings,
  };
}
