type VoiceCandidate = Pick<SpeechSynthesisVoice, 'lang' | 'localService'>;

// Some Android builds report voice tags with an underscore ("hi_IN") and in any case.
function normalizeLanguageTag(languageTag: string): string {
  return languageTag.replaceAll('_', '-').toLowerCase();
}

function toPrimaryLanguage(languageTag: string): string {
  return normalizeLanguageTag(languageTag).split('-')[0] ?? '';
}

// On-device voices start speaking sooner than network ones, and keep working offline.
function pickPreferredVoice<Voice extends VoiceCandidate>(voices: Voice[]): Voice | null {
  return voices.find((voice) => voice.localService) ?? voices[0] ?? null;
}

/**
 * The best voice for a BCP-47 tag such as `hi-IN`: an exact match first, then any voice of
 * the same language (`hi-…`), else `null`, meaning this device can't speak it (D-007).
 */
export function pickVoice<Voice extends VoiceCandidate>(
  voices: readonly Voice[],
  speechSynthesisLanguageTag: string,
): Voice | null {
  const wantedTag = normalizeLanguageTag(speechSynthesisLanguageTag);
  const exactMatches = voices.filter((voice) => normalizeLanguageTag(voice.lang) === wantedTag);
  if (exactMatches.length > 0) {
    return pickPreferredVoice(exactMatches);
  }
  const wantedLanguage = toPrimaryLanguage(speechSynthesisLanguageTag);
  return pickPreferredVoice(
    voices.filter((voice) => toPrimaryLanguage(voice.lang) === wantedLanguage),
  );
}
