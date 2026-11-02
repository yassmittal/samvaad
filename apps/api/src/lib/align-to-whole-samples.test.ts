import { describe, expect, test } from 'bun:test';
import { alignToWholeSamples } from './align-to-whole-samples';

async function* toAsyncChunks(chunks: number[][]): AsyncGenerator<Uint8Array> {
  for (const chunk of chunks) {
    yield new Uint8Array(chunk);
  }
}

async function collectChunks(chunks: AsyncIterable<Uint8Array>): Promise<number[][]> {
  const collected: number[][] = [];
  for await (const chunk of chunks) {
    collected.push([...chunk]);
  }
  return collected;
}

describe('alignToWholeSamples', () => {
  test('passes chunks of whole samples through unchanged', async () => {
    expect(
      await collectChunks(
        alignToWholeSamples(
          toAsyncChunks([
            [1, 2, 3, 4],
            [5, 6],
          ]),
        ),
      ),
    ).toEqual([
      [1, 2, 3, 4],
      [5, 6],
    ]);
  });

  test('carries a split sample over to the next chunk', async () => {
    expect(
      await collectChunks(alignToWholeSamples(toAsyncChunks([[1, 2, 3], [4, 5], [6]]))),
    ).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  test('skips a chunk that is only half a sample, and drops a dangling last byte', async () => {
    expect(await collectChunks(alignToWholeSamples(toAsyncChunks([[1], [2, 3]])))).toEqual([
      [1, 2],
    ]);
  });
});
