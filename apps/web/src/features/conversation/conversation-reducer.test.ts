import { describe, expect, test } from 'bun:test';
import { INITIAL_CONVERSATION_STATE, reduceConversation } from './conversation-reducer';

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
    expect(state.captions).toEqual([
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
    expect(state.captions).toEqual([
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

    expect(state.captions).toEqual([{ utteranceId: 'utterance-1', text: 'Hello.', isFinal: true }]);
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
});
