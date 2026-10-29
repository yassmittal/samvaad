import { describe, expect, test } from 'bun:test';
import { createSpeechQueue, type SpeechRequest } from './speech-queue';

function createRequest(utteranceId: string): SpeechRequest {
  return { utteranceId, text: `Text of ${utteranceId}.`, languageCode: 'en', isRepeat: false };
}

/** A queue whose speech only starts and finishes when the test says so. */
function createControlledQueue() {
  const events: string[] = [];
  const speaking: { request: SpeechRequest; start: () => void; finish: () => void }[] = [];
  const queue = createSpeechQueue({
    speak(request, { onStarted, onFinished }) {
      events.push(`speak ${request.utteranceId}`);
      speaking.push({ request, start: onStarted, finish: onFinished });
    },
    onSpeakingChange: (isSpeaking) => events.push(isSpeaking ? 'speaking' : 'silent'),
    onPlaybackStarted: (request) => events.push(`started ${request.utteranceId}`),
  });
  return { queue, events, speaking };
}

describe('createSpeechQueue', () => {
  test('speaks one request at a time, in the order they were queued', () => {
    const { queue, events, speaking } = createControlledQueue();

    queue.enqueue(createRequest('utterance-1'));
    queue.enqueue(createRequest('utterance-2'));
    queue.enqueue(createRequest('utterance-3'));
    expect(events).toEqual(['speaking', 'speak utterance-1']);

    for (const spoken of [0, 1, 2]) {
      speaking[spoken]?.start();
      speaking[spoken]?.finish();
    }

    expect(events).toEqual([
      'speaking',
      'speak utterance-1',
      'started utterance-1',
      'speak utterance-2',
      'started utterance-2',
      'speak utterance-3',
      'started utterance-3',
      'silent',
    ]);
  });

  test('reports speaking before the first sound, so the microphone can mute first', () => {
    const { queue, events } = createControlledQueue();

    queue.enqueue(createRequest('utterance-1'));

    expect(events[0]).toBe('speaking');
  });

  test('a failed request does not stop the ones after it', () => {
    const { queue, events, speaking } = createControlledQueue();
    queue.enqueue(createRequest('utterance-1'));
    queue.enqueue(createRequest('utterance-2'));

    speaking[0]?.finish();

    expect(events).toEqual(['speaking', 'speak utterance-1', 'speak utterance-2']);
  });

  test('finishing twice, or starting after finishing, is ignored', () => {
    const { queue, events, speaking } = createControlledQueue();
    queue.enqueue(createRequest('utterance-1'));
    queue.enqueue(createRequest('utterance-2'));

    speaking[0]?.finish();
    speaking[0]?.finish();
    speaking[0]?.start();

    expect(events).toEqual(['speaking', 'speak utterance-1', 'speak utterance-2']);
  });

  test('a request queued after the queue went silent starts speaking again', () => {
    const { queue, events, speaking } = createControlledQueue();
    queue.enqueue(createRequest('utterance-1'));
    speaking[0]?.finish();

    queue.enqueue(createRequest('utterance-2'));

    expect(events).toEqual([
      'speaking',
      'speak utterance-1',
      'silent',
      'speaking',
      'speak utterance-2',
    ]);
  });

  test('clearing drops the waiting requests but lets the current one finish', () => {
    const { queue, events, speaking } = createControlledQueue();
    queue.enqueue(createRequest('utterance-1'));
    queue.enqueue(createRequest('utterance-2'));

    queue.clearWaitingRequests();
    speaking[0]?.finish();

    expect(events).toEqual(['speaking', 'speak utterance-1', 'silent']);
  });
});
