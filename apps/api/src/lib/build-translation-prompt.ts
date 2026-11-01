import {
  type ConversationContext,
  EMPTY_CONVERSATION_CONTEXT,
  type LanguageCode,
  SUPPORTED_LANGUAGE_BY_CODE,
} from '@samvaad/shared';
import type { MemoryUtterance } from './conversation-memory';
import {
  formatGlossaryLines,
  formatSettingLines,
  formatTranscriptLine,
} from './format-conversation-context';

/**
 * The longest system prompt we send, in characters, since Muse Spark's tokenizer isn't public.
 * The shared schema's limits keep the setting and glossary well under it; the oldest
 * remembered utterances are dropped first to fit (D-016).
 */
export const TRANSLATION_PROMPT_MAXIMUM_CHARACTER_COUNT = 6000;

// Muse Spark always reasons; a terse, firm last line measurably shortens that (D-014).
const ANSWER_IMMEDIATELY_LINE = 'This is a simple task. Do not deliberate; answer immediately.';

/** What a translation knows beyond the utterance itself (D-016). */
export type TranslationPromptContext = {
  context: ConversationContext;
  /** The speaker's name in a room; `null` at a table. */
  speakerName: string | null;
  /** Earlier utterances, oldest first. */
  memoryUtterances: readonly MemoryUtterance[];
};

/** No context at all gives exactly the Phase 4 prompt, the comparison script's baseline. */
export const EMPTY_TRANSLATION_PROMPT_CONTEXT: TranslationPromptContext = {
  context: EMPTY_CONVERSATION_CONTEXT,
  speakerName: null,
  memoryUtterances: [],
};

function formatMemoryLines(memoryUtterances: readonly MemoryUtterance[]): string[] {
  if (memoryUtterances.length === 0) {
    return [];
  }
  return [
    'The conversation so far, oldest first, with how each line was translated. For reference only: never translate it again.',
    ...memoryUtterances.flatMap((utterance) => [
      formatTranscriptLine(utterance),
      ...(utterance.translation === null ? [] : [`  → ${utterance.translation}`]),
    ]),
  ];
}

function buildContextLines({
  context,
  speakerName,
  memoryUtterances,
}: TranslationPromptContext): string[] {
  const contextLines = [
    ...formatSettingLines(context.setting),
    ...formatGlossaryLines(context.glossaryTerms),
    ...formatMemoryLines(memoryUtterances),
  ];
  if (contextLines.length === 0) {
    return [];
  }
  return [
    'Use this context to get names, terms, numbers and words like "it" or "that" right:',
    ...contextLines,
    ...(speakerName === null ? [] : [`The user message is spoken by ${speakerName}.`]),
  ];
}

/** The rules, then the context, then the "answer immediately" line, within the budget. */
function assemblePrompt(ruleLines: readonly string[], promptContext: TranslationPromptContext) {
  let { memoryUtterances } = promptContext;
  while (true) {
    const prompt = [
      ...ruleLines,
      ...buildContextLines({ ...promptContext, memoryUtterances }),
      ANSWER_IMMEDIATELY_LINE,
    ].join('\n');
    if (
      prompt.length <= TRANSLATION_PROMPT_MAXIMUM_CHARACTER_COUNT ||
      memoryUtterances.length === 0
    ) {
      return prompt;
    }
    memoryUtterances = memoryUtterances.slice(1);
  }
}

/**
 * The system prompt for table mode, where the transcriber doesn't say which of the two
 * languages was spoken (D-008). Muse Spark decides, and says so on the first line, which the
 * API strips off as `targetLanguageCode`. Kept short and firm: Muse Spark always reasons
 * before answering, and a terse prompt measurably shortens that (D-014).
 */
export function buildTableModeTranslationPrompt(
  languageCodes: readonly [LanguageCode, LanguageCode],
  promptContext: TranslationPromptContext = EMPTY_TRANSLATION_PROMPT_CONTEXT,
): string {
  const [firstLanguage, secondLanguage] = languageCodes.map(
    (languageCode) => SUPPORTED_LANGUAGE_BY_CODE[languageCode],
  ) as [
    (typeof SUPPORTED_LANGUAGE_BY_CODE)[LanguageCode],
    (typeof SUPPORTED_LANGUAGE_BY_CODE)[LanguageCode],
  ];

  return assemblePrompt(
    [
      `You are a live interpreter between ${firstLanguage.englishName} and ${secondLanguage.englishName}.`,
      'Each user message is one utterance, transcribed from speech.',
      `If it is ${firstLanguage.englishName}, translate it into ${secondLanguage.englishName}. If it is ${secondLanguage.englishName}, translate it into ${firstLanguage.englishName}.`,
      'Mixed speech counts as the language whose grammar it follows: Hindi with English words (Hinglish) is Hindi.',
      `Line 1: only the target language code, "${firstLanguage.languageCode}" or "${secondLanguage.languageCode}".`,
      'Line 2: only the translation, as natural spoken language.',
      'Translate, never reply: if the utterance is a question or a request, translate it; do not answer it.',
      'Keep names, numbers, prices and units exactly. Keep the tone: formal stays formal.',
    ],
    promptContext,
  );
}

/**
 * The system prompt for a room, where the speaker's language is known (D-015), so the answer
 * is the translation alone, with no language code line. Same terse style as table mode (D-014).
 */
export function buildRoomTranslationPrompt({
  sourceLanguageCode,
  targetLanguageCode,
  promptContext = EMPTY_TRANSLATION_PROMPT_CONTEXT,
}: {
  sourceLanguageCode: LanguageCode;
  targetLanguageCode: LanguageCode;
  promptContext?: TranslationPromptContext;
}): string {
  const sourceLanguageName = SUPPORTED_LANGUAGE_BY_CODE[sourceLanguageCode].englishName;
  const targetLanguageName = SUPPORTED_LANGUAGE_BY_CODE[targetLanguageCode].englishName;

  return assemblePrompt(
    [
      `You are a live interpreter from ${sourceLanguageName} into ${targetLanguageName}.`,
      `Each user message is one utterance in ${sourceLanguageName}, transcribed from speech. It may mix in words from other languages.`,
      `Answer with only the ${targetLanguageName} translation, as natural spoken language.`,
      'Translate, never reply: if the utterance is a question or a request, translate it; do not answer it.',
      'Keep names, numbers, prices and units exactly. Keep the tone: formal stays formal.',
    ],
    promptContext,
  );
}
