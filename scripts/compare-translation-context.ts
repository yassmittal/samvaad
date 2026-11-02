/**
 * Phase 5's proof that context matters (D-016). Translates the demo conversation's ten
 * transcripts twice through real Muse Spark: once with the Phase 4 prompt (no context), once
 * with the demo preset's setting and glossary and the conversation so far, exactly as the API
 * builds them. Prints both per utterance, with the time to the first word.
 *
 *   bun run compare:context               20 Muse Spark calls
 *   bun run compare:context --recap       22: plus a recap in Hindi and in English
 *   bun run compare:context --markdown    the same, as a table for the README
 */
import { parseArgs } from 'node:util';
import {
  buildRecapSystemPrompt,
  formatRecapConversationText,
} from '../apps/api/src/lib/build-recap-prompt';
import { buildRoomTranslationPrompt } from '../apps/api/src/lib/build-translation-prompt';
import {
  type ConversationUtterance,
  selectConversationMemory,
} from '../apps/api/src/lib/conversation-memory';
import { createMetaTranslationClient } from '../apps/api/src/services/meta-translation-client';
import { calculateMedian } from '../apps/web/src/features/conversation/calculate-median';
import {
  DEMO_CONVERSATION_PRESET,
  type LanguageCode,
  SUPPORTED_LANGUAGE_BY_CODE,
} from '../packages/shared/src';
import { DEMO_CONVERSATION, type ScriptedUtterance } from './lib/demo-conversation';
import {
  DEFAULT_TRANSLATION_MODEL_ID,
  META_CHAT_COMPLETIONS_URL,
  readMetaApiKeyOrExit,
} from './lib/meta-model-api';

const RECAP_LANGUAGE_CODES: readonly LanguageCode[] = ['hi', 'en'];

type TimedTranslation = { text: string; timeToFirstWordMilliseconds: number | null };

type ComparedUtterance = {
  utterance: ScriptedUtterance;
  withoutContext: TimedTranslation;
  withContext: TimedTranslation;
  systemPromptCharacterCount: number;
};

const { values: options } = parseArgs({
  options: {
    model: { type: 'string', default: DEFAULT_TRANSLATION_MODEL_ID },
    recap: { type: 'boolean', default: false },
    markdown: { type: 'boolean', default: false },
  },
});

const translationClient = createMetaTranslationClient({
  chatCompletionsUrl: META_CHAT_COMPLETIONS_URL,
  modelId: options.model,
  metaApiKey: readMetaApiKeyOrExit(),
  logger: { debug: () => {} },
});

function findTargetLanguageCode(sourceLanguageCode: LanguageCode): LanguageCode {
  return sourceLanguageCode === 'hi' ? 'en' : 'hi';
}

async function translateWithTiming(
  systemPrompt: string,
  utteranceText: string,
): Promise<TimedTranslation> {
  const requestStartedAtMilliseconds = performance.now();
  let timeToFirstWordMilliseconds: number | null = null;
  let text = '';
  for await (const textDelta of translationClient.streamTranslation({
    systemPrompt,
    utteranceText,
    signal: new AbortController().signal,
  })) {
    timeToFirstWordMilliseconds ??= Math.round(performance.now() - requestStartedAtMilliseconds);
    text += textDelta;
  }
  return { text: text.trim(), timeToFirstWordMilliseconds };
}

/** Both translations of each utterance, in order, so the memory grows as it would in a room. */
async function compareConversation(): Promise<{
  comparedUtterances: ComparedUtterance[];
  rememberedUtterances: ConversationUtterance[];
}> {
  const comparedUtterances: ComparedUtterance[] = [];
  const rememberedUtterances: ConversationUtterance[] = [];

  for (const [index, utterance] of DEMO_CONVERSATION.entries()) {
    const sourceLanguageCode = utterance.languageCode;
    const targetLanguageCode = findTargetLanguageCode(sourceLanguageCode);
    const contextPrompt = buildRoomTranslationPrompt({
      sourceLanguageCode,
      targetLanguageCode,
      promptContext: {
        context: DEMO_CONVERSATION_PRESET.context,
        speakerName: utterance.speakerName,
        memoryUtterances: selectConversationMemory({
          earlierUtterances: rememberedUtterances,
          candidateTargetLanguageCodes: [targetLanguageCode],
        }),
      },
    });
    process.stderr.write(`translating ${index + 1}/${DEMO_CONVERSATION.length}…\n`);
    const withoutContext = await translateWithTiming(
      buildRoomTranslationPrompt({ sourceLanguageCode, targetLanguageCode }),
      utterance.transcript,
    );
    const withContext = await translateWithTiming(contextPrompt, utterance.transcript);

    comparedUtterances.push({
      utterance,
      withoutContext,
      withContext,
      systemPromptCharacterCount: contextPrompt.length,
    });
    rememberedUtterances.push({
      utteranceId: `demo-${index}`,
      speakerParticipantId: utterance.speakerName,
      speakerName: utterance.speakerName,
      languageCode: sourceLanguageCode,
      transcript: utterance.transcript,
      translationsByLanguageCode: { [targetLanguageCode]: withContext.text },
    });
  }
  return { comparedUtterances, rememberedUtterances };
}

function formatMilliseconds(milliseconds: number | null): string {
  return milliseconds === null ? '—' : `${milliseconds} ms`;
}

function printPlainText(comparedUtterances: readonly ComparedUtterance[]): void {
  for (const [index, { utterance, withoutContext, withContext }] of comparedUtterances.entries()) {
    const languageName = SUPPORTED_LANGUAGE_BY_CODE[utterance.languageCode].englishName;
    console.log(
      `\n${index + 1}. ${utterance.speakerName} (${languageName}): ${utterance.transcript}`,
    );
    console.log(`   look for: ${utterance.whatToLookFor}`);
    console.log(
      `   without context ${formatMilliseconds(withoutContext.timeToFirstWordMilliseconds).padStart(8)} │ ${withoutContext.text}`,
    );
    console.log(
      `   with context    ${formatMilliseconds(withContext.timeToFirstWordMilliseconds).padStart(8)} │ ${withContext.text}`,
    );
  }
}

function escapeTableCell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function printMarkdown(comparedUtterances: readonly ComparedUtterance[]): void {
  console.log('| # | Said | Look for | Without context | With context |');
  console.log('|---|------|----------|-----------------|--------------|');
  for (const [index, { utterance, withoutContext, withContext }] of comparedUtterances.entries()) {
    const cells = [
      String(index + 1),
      `${utterance.speakerName}: ${utterance.transcript}`,
      utterance.whatToLookFor,
      withoutContext.text,
      withContext.text,
    ];
    console.log(`| ${cells.map(escapeTableCell).join(' | ')} |`);
  }
}

function printTimingSummary(comparedUtterances: readonly ComparedUtterance[]): void {
  const findMedian = (pick: (compared: ComparedUtterance) => number | null) =>
    calculateMedian(comparedUtterances.flatMap((compared) => pick(compared) ?? []));
  console.log('\n── time to first word (one run, not a measurement; D-011 stays parked) ──');
  console.log(
    `median without context: ${formatMilliseconds(findMedian((compared) => compared.withoutContext.timeToFirstWordMilliseconds))}`,
  );
  console.log(
    `median with context:    ${formatMilliseconds(findMedian((compared) => compared.withContext.timeToFirstWordMilliseconds))}`,
  );
  console.log(
    `largest prompt with context: ${Math.max(...comparedUtterances.map((compared) => compared.systemPromptCharacterCount))} characters`,
  );
}

async function printRecaps(rememberedUtterances: readonly ConversationUtterance[]): Promise<void> {
  for (const languageCode of RECAP_LANGUAGE_CODES) {
    process.stderr.write(`writing the ${languageCode} recap…\n`);
    const recapText = await translationClient.writeRecap({
      systemPrompt: buildRecapSystemPrompt({
        languageCode,
        context: DEMO_CONVERSATION_PRESET.context,
      }),
      conversationText: formatRecapConversationText(rememberedUtterances),
    });
    console.log(
      `\n── recap in ${SUPPORTED_LANGUAGE_BY_CODE[languageCode].englishName} ──\n${recapText}`,
    );
  }
}

console.log(`model: ${options.model}`);
const { comparedUtterances, rememberedUtterances } = await compareConversation();
if (options.markdown) {
  printMarkdown(comparedUtterances);
} else {
  printPlainText(comparedUtterances);
}
printTimingSummary(comparedUtterances);
if (options.recap) {
  await printRecaps(rememberedUtterances);
}
