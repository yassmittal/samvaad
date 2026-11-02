import { describe, expect, test } from 'bun:test';
import { createTranslationAudioStore } from './translation-audio-store';

describe('createTranslationAudioStore', () => {
  test('collects chunks per utterance and tells subscribers as they arrive and end', () => {
    const store = createTranslationAudioStore();
    const notifications: string[] = [];
    store.subscribe('u1', () => notifications.push('u1 changed'));

    store.appendChunk('u1', new Int16Array([1, 2]));
    store.appendChunk('u2', new Int16Array([9]));
    store.appendChunk('u1', new Int16Array([3]));
    store.end('u1', false);

    expect(store.find('u1')?.chunks.map((chunk) => [...chunk])).toEqual([[1, 2], [3]]);
    expect(store.find('u1')?.isEnded).toBe(true);
    expect(notifications).toEqual(['u1 changed', 'u1 changed', 'u1 changed']);
  });

  test('an end without audio is kept, with whether it failed', () => {
    const store = createTranslationAudioStore();

    store.end('u1', true);

    expect(store.find('u1')).toEqual({ chunks: [], isEnded: true, hasFailed: true });
  });

  test('ignores chunks after the end, and stops telling an unsubscribed listener', () => {
    const store = createTranslationAudioStore();
    let notificationCount = 0;
    const unsubscribe = store.subscribe('u1', () => {
      notificationCount += 1;
    });

    store.end('u1', false);
    unsubscribe();
    store.appendChunk('u1', new Int16Array([1]));

    expect(store.find('u1')?.chunks).toEqual([]);
    expect(notificationCount).toBe(1);
  });

  test('keeps only the newest translations', () => {
    const store = createTranslationAudioStore({ maximumStoredCount: 2 });

    store.end('u1', false);
    store.end('u2', false);
    store.end('u3', false);

    expect(store.find('u1')).toBeNull();
    expect(store.find('u3')).not.toBeNull();
  });
});
