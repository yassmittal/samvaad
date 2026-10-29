import type { LanguageCode, ServerMessage } from '@samvaad/shared';
import type { FastifyBaseLogger } from 'fastify';
import {
  buildRoomTranslationPrompt,
  buildTableModeTranslationPrompt,
} from '../lib/build-translation-prompt';
import type { UtteranceTranslationPlan } from '../lib/plan-utterance-translations';
import {
  createTargetLanguageLineParser,
  type ParsedTranslationDelta,
} from '../lib/target-language-line-parser';
import type { MetaTranslationClient } from '../services/meta-translation-client';

export type UtteranceToTranslate = {
  utteranceId: string;
  utteranceText: string;
  speechEndedAtEpochMilliseconds: number;
  transcriptFinalAtEpochMilliseconds: number;
};

type TranslationDeltaParser = {
  push: (textDelta: string) => ParsedTranslationDelta | null;
  finish: () => ParsedTranslationDelta | null;
  hasUsedFallback: () => boolean;
};

function buildSystemPrompt(plan: UtteranceTranslationPlan): string {
  return plan.kind === 'between_table_languages'
    ? buildTableModeTranslationPrompt(plan.languageCodes)
    : buildRoomTranslationPrompt(plan);
}

/** Table mode's answer starts with a target-language line (D-008); a room's doesn't (D-015). */
function createTranslationDeltaParser(plan: UtteranceTranslationPlan): TranslationDeltaParser {
  if (plan.kind === 'between_table_languages') {
    return createTargetLanguageLineParser({
      languageCodes: plan.languageCodes,
      fallbackLanguageCode: plan.languageCodes[1],
    });
  }
  return {
    push: (textDelta) => ({ targetLanguageCode: plan.targetLanguageCode, textDelta }),
    finish: () => null,
    hasUsedFallback: () => false,
  };
}

/**
 * Streams one translation of one utterance from Muse Spark (D-006) as protocol messages.
 * Never throws: a failure becomes an `error` message for that utterance, delivered in order.
 */
export async function* produceTranslationMessages({
  translationClient,
  logger,
  utterance,
  plan,
  signal,
}: {
  translationClient: MetaTranslationClient;
  logger: FastifyBaseLogger;
  utterance: UtteranceToTranslate;
  plan: UtteranceTranslationPlan;
  signal: AbortSignal;
}): AsyncGenerator<ServerMessage> {
  const { utteranceId } = utterance;
  const translationDeltaParser = createTranslationDeltaParser(plan);
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
    const textDeltas = translationClient.streamTranslation({
      systemPrompt: buildSystemPrompt(plan),
      utteranceText: utterance.utteranceText,
      signal,
    });
    for await (const textDelta of textDeltas) {
      yield* toDeltaMessages(translationDeltaParser.push(textDelta));
    }
    yield* toDeltaMessages(translationDeltaParser.finish());
  } catch (error) {
    if (signal.aborted) {
      return;
    }
    logger.warn({ err: error, utteranceId }, 'translation failed');
    yield {
      type: 'error',
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'This sentence could not be translated.',
      utteranceId,
    };
    return;
  }

  if (translationDeltaParser.hasUsedFallback()) {
    logger.warn({ utteranceId }, 'translation had no target language line');
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
  logger.info(
    {
      utteranceId,
      targetLanguageCode,
      speechEndToTranslationCompleteMilliseconds:
        translationCompleteAtEpochMilliseconds - utterance.speechEndedAtEpochMilliseconds,
      transcriptFinalToFirstTranslationDeltaMilliseconds:
        firstTranslationDeltaAtEpochMilliseconds - utterance.transcriptFinalAtEpochMilliseconds,
    },
    'translation complete',
  );
  yield {
    type: 'translation_complete',
    utteranceId,
    targetLanguageCode,
    text: translationText.trim(),
    timings: {
      speechEndedAtEpochMilliseconds: utterance.speechEndedAtEpochMilliseconds,
      transcriptFinalAtEpochMilliseconds: utterance.transcriptFinalAtEpochMilliseconds,
      firstTranslationDeltaAtEpochMilliseconds,
      translationCompleteAtEpochMilliseconds,
    },
  };
}
