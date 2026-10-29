import { describe, expect, test } from 'bun:test';
import {
  findCandidateTargetLanguageCodes,
  isListeningIn,
  planUtteranceTranslations,
} from './plan-utterance-translations';

describe('planUtteranceTranslations', () => {
  test('table mode: one translation, into whichever of the two was not spoken', () => {
    const plans = planUtteranceTranslations({
      speakerLanguageCodes: ['hi', 'en'],
      roomLanguageCodes: [['hi', 'en']],
    });

    expect(plans).toEqual([{ kind: 'between_table_languages', languageCodes: ['hi', 'en'] }]);
  });

  test('a room: from the speaker’s language into the listener’s', () => {
    const plans = planUtteranceTranslations({
      speakerLanguageCodes: ['hi'],
      roomLanguageCodes: [['hi'], ['en']],
    });

    expect(plans).toEqual([
      { kind: 'into_listener_language', sourceLanguageCode: 'hi', targetLanguageCode: 'en' },
    ]);
  });

  test('two English listeners share one translation', () => {
    const plans = planUtteranceTranslations({
      speakerLanguageCodes: ['hi'],
      roomLanguageCodes: [['hi'], ['en'], ['en'], ['ta']],
    });

    expect(plans.map((plan) => findCandidateTargetLanguageCodes(plan))).toEqual([['en'], ['ta']]);
  });

  test('a listener in the speaker’s language, or nobody else, needs no translation', () => {
    expect(
      planUtteranceTranslations({
        speakerLanguageCodes: ['hi'],
        roomLanguageCodes: [['hi'], ['hi']],
      }),
    ).toEqual([]);
    expect(
      planUtteranceTranslations({ speakerLanguageCodes: ['hi'], roomLanguageCodes: [['hi']] }),
    ).toEqual([]);
  });
});

describe('isListeningIn', () => {
  test('a room listener hears only their language; the table hears both', () => {
    expect(isListeningIn(['en'], ['en'])).toBe(true);
    expect(isListeningIn(['hi'], ['en'])).toBe(false);
    expect(isListeningIn(['hi', 'en'], ['hi', 'en'])).toBe(true);
  });
});
