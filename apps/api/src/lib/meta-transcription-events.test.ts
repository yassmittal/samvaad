import { describe, expect, test } from 'bun:test';
import { parseMetaTranscriptionEvent } from './meta-transcription-events';

describe('parseMetaTranscriptionEvent', () => {
  test('reads the events recorded in Phase 0', () => {
    expect(
      parseMetaTranscriptionEvent(
        '{"type":"speechComplete","audioProcessedMs":4380,"turnId":0,"transcript":"Hello."}',
      ),
    ).toEqual({ type: 'speechComplete', audioProcessedMs: 4380, turnId: 0, transcript: 'Hello.' });
  });

  test('ignores event types we do not use', () => {
    expect(
      parseMetaTranscriptionEvent('{"type":"audioProgress","audioProcessedMs":80}'),
    ).toBeNull();
    expect(parseMetaTranscriptionEvent('{"type":"somethingNew"}')).toBeNull();
  });

  test('throws when a known event has changed shape', () => {
    expect(() =>
      parseMetaTranscriptionEvent('{"type":"speechComplete","turnId":"zero"}'),
    ).toThrow();
  });
});
