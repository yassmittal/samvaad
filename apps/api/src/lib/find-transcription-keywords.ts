import type { GlossaryTerm } from '@samvaad/shared';

/**
 * Muse Voice Transcribe's `keywords`, so glossary names and terms are heard right: each term,
 * and its form in the other language when given (D-005, D-016). Meta accepted Devanagari
 * keywords in a live check (30 Oct).
 */
export function findTranscriptionKeywords(glossaryTerms: readonly GlossaryTerm[]): string[] {
  const keywords = new Set<string>();
  for (const { term, preferredTranslation } of glossaryTerms) {
    keywords.add(term);
    if (preferredTranslation.length > 0) {
      keywords.add(preferredTranslation);
    }
  }
  return [...keywords];
}

export function haveSameKeywords(
  firstKeywords: readonly string[],
  secondKeywords: readonly string[],
): boolean {
  return (
    firstKeywords.length === secondKeywords.length &&
    firstKeywords.every((keyword, index) => keyword === secondKeywords[index])
  );
}
