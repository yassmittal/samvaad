import { describe, expect, test } from 'bun:test';
import {
  type ConversationState,
  INITIAL_CONVERSATION_STATE,
  reduceConversation,
} from './conversation-reducer';

const SPEECH_ENDED_AT_EPOCH_MILLISECONDS = 1_700_000_000_000;

describe('reduceConversation', () => {
  test('a growing partial replaces itself, then becomes final', () => {
    let state = reduceConversation(INITIAL_CONVERSATION_STATE, {
      type: 'transcript_partial',
      utteranceId: 'utterance-1',
      text: 'नमस्ते',
    });
    state = reduceConversation(state, {
      type: 'transcript_partial',
      utteranceId: 'utterance-1',
      text: 'नमस्ते, मैं',
    });
    expect(state.captions).toMatchObject([
      { utteranceId: 'utterance-1', text: 'नमस्ते, मैं', isFinal: false },
    ]);

    state = reduceConversation(state, {
      type: 'transcript_final',
      utteranceId: 'utterance-1',
      speakerParticipantId: 'participant-1',
      languageCode: null,
      text: 'नमस्ते, मैं जयपुर से हूँ।',
      speechEndedAtEpochMilliseconds: SPEECH_ENDED_AT_EPOCH_MILLISECONDS,
    });
    expect(state.captions).toMatchObject([
      { utteranceId: 'utterance-1', text: 'नमस्ते, मैं जयपुर से हूँ।', isFinal: true },
    ]);
  });

  test('a late partial never undoes a final caption', () => {
    let state = reduceConversation(INITIAL_CONVERSATION_STATE, {
      type: 'transcript_final',
      utteranceId: 'utterance-1',
      speakerParticipantId: 'participant-1',
      languageCode: null,
      text: 'Hello.',
      speechEndedAtEpochMilliseconds: SPEECH_ENDED_AT_EPOCH_MILLISECONDS,
    });
    state = reduceConversation(state, {
      type: 'transcript_partial',
      utteranceId: 'utterance-1',
      text: 'Hel',
    });

    expect(state.captions).toMatchObject([
      { utteranceId: 'utterance-1', text: 'Hello.', isFinal: true },
    ]);
  });

  test('each utterance gets its own caption, in order', () => {
    let state = reduceConversation(INITIAL_CONVERSATION_STATE, {
      type: 'transcript_partial',
      utteranceId: 'utterance-1',
      text: 'one',
    });
    state = reduceConversation(state, {
      type: 'transcript_partial',
      utteranceId: 'utterance-2',
      text: 'two',
    });

    expect(state.captions.map((caption) => caption.utteranceId)).toEqual([
      'utterance-1',
      'utterance-2',
    ]);
  });

  test('keeps an error to show, but ignores MICROPHONE_NOT_OPEN', () => {
    let state = reduceConversation(INITIAL_CONVERSATION_STATE, {
      type: 'error',
      code: 'MICROPHONE_NOT_OPEN',
      message: 'ignored',
    });
    expect(state.latestError).toBeNull();

    state = reduceConversation(state, {
      type: 'error',
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Meta is down',
    });
    expect(state.latestError?.code).toBe('UPSTREAM_UNAVAILABLE');
  });

  describe('translations', () => {
    function createStateWithFinalCaption(): ConversationState {
      return reduceConversation(INITIAL_CONVERSATION_STATE, {
        type: 'transcript_final',
        utteranceId: 'utterance-1',
        speakerParticipantId: 'participant-1',
        languageCode: null,
        text: 'नमस्ते, दोस्त।',
        speechEndedAtEpochMilliseconds: SPEECH_ENDED_AT_EPOCH_MILLISECONDS,
      });
    }

    test('deltas fill the translation in, and completion records the delay', () => {
      let state = createStateWithFinalCaption();
      state = reduceConversation(state, {
        type: 'translation_delta',
        utteranceId: 'utterance-1',
        targetLanguageCode: 'en',
        textDelta: 'Hello, ',
      });
      state = reduceConversation(state, {
        type: 'translation_delta',
        utteranceId: 'utterance-1',
        targetLanguageCode: 'en',
        textDelta: 'friend.',
      });
      expect(state.captions[0]?.translation).toMatchObject({
        text: 'Hello, friend.',
        isComplete: false,
      });

      state = reduceConversation(state, {
        type: 'translation_complete',
        utteranceId: 'utterance-1',
        targetLanguageCode: 'en',
        text: 'Hello, friend.',
        timings: {
          speechEndedAtEpochMilliseconds: SPEECH_ENDED_AT_EPOCH_MILLISECONDS,
          transcriptFinalAtEpochMilliseconds: SPEECH_ENDED_AT_EPOCH_MILLISECONDS + 800,
          firstTranslationDeltaAtEpochMilliseconds: SPEECH_ENDED_AT_EPOCH_MILLISECONDS + 1700,
          translationCompleteAtEpochMilliseconds: SPEECH_ENDED_AT_EPOCH_MILLISECONDS + 1900,
        },
      });
      expect(state.captions[0]?.translation).toEqual({
        targetLanguageCode: 'en',
        text: 'Hello, friend.',
        isComplete: true,
        speechEndToTranslationCompleteMilliseconds: 1900,
      });
    });

    test('a failed translation marks its own bubble, not the status line', () => {
      const state = reduceConversation(createStateWithFinalCaption(), {
        type: 'error',
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'This sentence could not be translated.',
        utteranceId: 'utterance-1',
      });

      expect(state.captions[0]?.hasTranslationFailed).toBe(true);
      expect(state.latestError).toBeNull();
    });
  });
});
