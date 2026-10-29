import { describe, expect, test } from 'bun:test';
import { parseServerSentEvents } from './parse-server-sent-events';

describe('parseServerSentEvents', () => {
  test('returns the payload of each complete data line', () => {
    const result = parseServerSentEvents('data: {"a":1}\n\ndata: [DONE]\n\n');

    expect(result.dataPayloads).toEqual(['{"a":1}', '[DONE]']);
    expect(result.remainingText).toBe('');
  });

  test('keeps a line cut off by the network for the next chunk', () => {
    const firstResult = parseServerSentEvents('data: {"a":1}\n\ndata: {"b"');
    expect(firstResult.dataPayloads).toEqual(['{"a":1}']);

    const secondResult = parseServerSentEvents(`${firstResult.remainingText}:2}\n\n`);
    expect(secondResult.dataPayloads).toEqual(['{"b":2}']);
  });

  test('ignores comments and other fields, and accepts CRLF line endings', () => {
    const result = parseServerSentEvents(': keep-alive\r\nevent: chunk\r\ndata: x\r\n\r\n');

    expect(result.dataPayloads).toEqual(['x']);
  });
});
