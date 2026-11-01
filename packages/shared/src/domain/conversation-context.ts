import { z } from 'zod';

/**
 * What Muse Spark is told about a conversation besides the conversation itself (D-016): the
 * setting and a glossary. The limits keep the translation prompt short (D-014).
 */

export const MAXIMUM_SETTING_LENGTH = 400;
export const MAXIMUM_GLOSSARY_TERM_COUNT = 20;
export const MAXIMUM_GLOSSARY_TERM_LENGTH = 60;

export const glossaryTermSchema = z.object({
  /** A name, product or phrase, as one of the participants says it. Also a transcription keyword. */
  term: z
    .string()
    .trim()
    .min(1, { error: 'A glossary term cannot be blank.' })
    .max(MAXIMUM_GLOSSARY_TERM_LENGTH, {
      error: `A glossary term is at most ${MAXIMUM_GLOSSARY_TERM_LENGTH} characters.`,
    }),
  /** How it is said in the other language. Blank keeps the term as it is, as for a name. */
  preferredTranslation: z
    .string()
    .trim()
    .max(MAXIMUM_GLOSSARY_TERM_LENGTH, {
      error: `A translation in the glossary is at most ${MAXIMUM_GLOSSARY_TERM_LENGTH} characters.`,
    }),
});

export const conversationContextSchema = z.object({
  /** "What's this conversation about?" Blank when not given. */
  setting: z
    .string()
    .trim()
    .max(MAXIMUM_SETTING_LENGTH, {
      error: `The description is at most ${MAXIMUM_SETTING_LENGTH} characters.`,
    }),
  glossaryTerms: z.array(glossaryTermSchema).max(MAXIMUM_GLOSSARY_TERM_COUNT, {
    error: `The glossary holds at most ${MAXIMUM_GLOSSARY_TERM_COUNT} terms.`,
  }),
});

export type GlossaryTerm = z.infer<typeof glossaryTermSchema>;
export type ConversationContext = z.infer<typeof conversationContextSchema>;

export const EMPTY_CONVERSATION_CONTEXT: ConversationContext = { setting: '', glossaryTerms: [] };

export function isConversationContextEmpty(context: ConversationContext): boolean {
  return context.setting.length === 0 && context.glossaryTerms.length === 0;
}
