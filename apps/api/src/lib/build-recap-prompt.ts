import {
  type ConversationContext,
  type LanguageCode,
  SUPPORTED_LANGUAGE_BY_CODE,
} from '@samvaad/shared';
import type { ConversationUtterance } from './conversation-memory';
import {
  formatGlossaryLines,
  formatSettingLines,
  formatTranscriptLine,
} from './format-conversation-context';

/**
 * The most conversation a recap reads, in characters. About 45 minutes of steady talk; past
 * that the recap covers the most recent part, which is where agreements end up.
 */
export const RECAP_CONVERSATION_MAXIMUM_CHARACTER_COUNT = 30_000;

/** The system prompt for one recap, written in the listener's language (D-016). */
export function buildRecapSystemPrompt({
  languageCode,
  context,
}: {
  languageCode: LanguageCode;
  context: ConversationContext;
}): string {
  const languageName = SUPPORTED_LANGUAGE_BY_CODE[languageCode].englishName;
  return [
    'You write the recap at the end of a conversation that a live interpreter translated. The user message is the conversation, as transcribed from speech.',
    `Write the recap in ${languageName} only, for someone who reads ${languageName}.`,
    `Three sections, each a heading on its own line, in ${languageName}, then short lines that start with "- ":`,
    '1. What was agreed: only what both people accepted. An offer nobody accepted is an open question.',
    '2. Numbers and dates: quantities, prices, amounts of money, deadlines, with what each one is for.',
    '3. Open questions: anything asked and not answered, or still to be decided.',
    `A section with nothing in it gets one line that says so, in ${languageName}.`,
    'Only what was said: never invent, estimate or add details. Not a transcript: no greetings and no "he said, she said".',
    'Keep names, numbers, prices and units exactly. Plain text: no Markdown other than the "- " lines.',
    ...formatSettingLines(context.setting),
    ...formatGlossaryLines(context.glossaryTerms),
  ].join('\n');
}

/** The conversation as the recap reads it: one line per utterance, the newest kept if it's long. */
export function formatRecapConversationText(utterances: readonly ConversationUtterance[]): string {
  const keptLines: string[] = [];
  let characterCount = 0;
  for (const utterance of [...utterances].reverse()) {
    const line = formatTranscriptLine(utterance);
    characterCount += line.length + 1;
    if (characterCount > RECAP_CONVERSATION_MAXIMUM_CHARACTER_COUNT) {
      break;
    }
    keptLines.unshift(line);
  }
  return keptLines.join('\n');
}
