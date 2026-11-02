import { describe, expect, test } from 'bun:test';
import type { Caption } from '../conversation/conversation-reducer';
import { findCallOrbState } from './find-call-orb-state';

function createCaption(overrides: Partial<Caption>): Caption {
  return {
    utteranceId: 'u1',
    text: 'नमस्ते',
    isFinal: true,
    isOwnUtterance: true,
    languageCode: 'hi',
    translation: null,
    hasTranslationFailed: false,
    receipt: null,
    ...overrides,
  };
}

const quietCall = {
  listenerLanguageCode: 'hi',
  isSpeaking: false,
  isOtherPersonSpeaking: false,
  isReconnecting: false,
} as const;

describe('findCallOrbState', () => {
  test('a call with nothing said yet is idle', () => {
    expect(findCallOrbState({ ...quietCall, captions: [] })).toBe('idle');
  });

  test('your words arriving as a partial transcript: you are speaking', () => {
    expect(findCallOrbState({ ...quietCall, captions: [createCaption({ isFinal: false })] })).toBe(
      'you_speaking',
    );
  });

  test('your finished words on their way to the other phone, until the ✓ comes', () => {
    expect(findCallOrbState({ ...quietCall, captions: [createCaption({})] })).toBe(
      'translating_to_them',
    );
    expect(
      findCallOrbState({ ...quietCall, captions: [createCaption({ receipt: 'translated' })] }),
    ).toBe('idle');
  });

  test('their finished words, not yet translated for you', () => {
    const theirCaption = createCaption({ isOwnUtterance: false, languageCode: 'en', text: 'Hi' });

    expect(findCallOrbState({ ...quietCall, captions: [theirCaption] })).toBe('translating_to_you');
  });

  test('speaking their translation beats everything but a reconnect', () => {
    const captions = [createCaption({ isFinal: false })];

    expect(findCallOrbState({ ...quietCall, captions, isSpeaking: true })).toBe(
      'their_translation_playing',
    );
    expect(
      findCallOrbState({ ...quietCall, captions, isSpeaking: true, isReconnecting: true }),
    ).toBe('reconnecting');
  });

  test('their real voice coming through: they are speaking, unless you are (D-023)', () => {
    expect(findCallOrbState({ ...quietCall, captions: [], isOtherPersonSpeaking: true })).toBe(
      'they_speaking',
    );
    expect(
      findCallOrbState({
        ...quietCall,
        captions: [createCaption({ isFinal: false })],
        isOtherPersonSpeaking: true,
      }),
    ).toBe('you_speaking');
  });
});
