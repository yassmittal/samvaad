import { describe, expect, test } from 'bun:test';
import { raceTextStreams } from './race-text-streams';

type ScriptedStream = {
  delayBeforeFirstTextMilliseconds: number;
  texts: string[];
  /** Throw instead of yielding the first text. */
  shouldFail?: boolean;
};

function createScriptedStarter(scripts: ScriptedStream[]) {
  const abortedStreamIndexes: number[] = [];
  let startedStreamCount = 0;

  async function* startTextStream(signal: AbortSignal): AsyncGenerator<string> {
    const streamIndex = startedStreamCount;
    startedStreamCount += 1;
    const script = scripts[streamIndex];
    if (!script) {
      throw new Error(`no script for stream ${streamIndex}`);
    }
    signal.addEventListener('abort', () => abortedStreamIndexes.push(streamIndex));
    await Bun.sleep(script.delayBeforeFirstTextMilliseconds);
    if (signal.aborted) {
      throw new Error(`stream ${streamIndex} aborted`);
    }
    if (script.shouldFail) {
      throw new Error(`stream ${streamIndex} failed`);
    }
    for (const text of script.texts) {
      yield text;
    }
  }

  return {
    startTextStream,
    abortedStreamIndexes,
    findStartedStreamCount: () => startedStreamCount,
  };
}

async function collectTexts(textStream: AsyncIterable<string>): Promise<string[]> {
  const texts: string[] = [];
  for await (const text of textStream) {
    texts.push(text);
  }
  return texts;
}

describe('raceTextStreams', () => {
  test('yields the whole answer of the first stream to produce text and aborts the others', async () => {
    const starter = createScriptedStarter([
      { delayBeforeFirstTextMilliseconds: 80, texts: ['slow'] },
      { delayBeforeFirstTextMilliseconds: 5, texts: ['fast ', 'answer'] },
    ]);

    const texts = await collectTexts(
      raceTextStreams({
        startTextStream: starter.startTextStream,
        streamCount: 2,
        signal: new AbortController().signal,
      }),
    );

    expect(texts).toEqual(['fast ', 'answer']);
    expect(starter.abortedStreamIndexes).toContain(0);
  });

  test('a stream that fails first loses to one that answers', async () => {
    const starter = createScriptedStarter([
      { delayBeforeFirstTextMilliseconds: 1, texts: [], shouldFail: true },
      { delayBeforeFirstTextMilliseconds: 20, texts: ['still here'] },
    ]);

    const texts = await collectTexts(
      raceTextStreams({
        startTextStream: starter.startTextStream,
        streamCount: 2,
        signal: new AbortController().signal,
      }),
    );

    expect(texts).toEqual(['still here']);
  });

  test('throws when every stream fails', async () => {
    const starter = createScriptedStarter([
      { delayBeforeFirstTextMilliseconds: 1, texts: [], shouldFail: true },
      { delayBeforeFirstTextMilliseconds: 5, texts: [], shouldFail: true },
    ]);

    const race = raceTextStreams({
      startTextStream: starter.startTextStream,
      streamCount: 2,
      signal: new AbortController().signal,
    });

    await expect(collectTexts(race)).rejects.toThrow('failed');
  });

  test('a count of one starts one stream and passes it straight through', async () => {
    const starter = createScriptedStarter([
      { delayBeforeFirstTextMilliseconds: 1, texts: ['only ', 'one'] },
    ]);

    const texts = await collectTexts(
      raceTextStreams({
        startTextStream: starter.startTextStream,
        streamCount: 1,
        signal: new AbortController().signal,
      }),
    );

    expect(texts).toEqual(['only ', 'one']);
    expect(starter.findStartedStreamCount()).toBe(1);
  });

  test('ends without text when every stream ends without text', async () => {
    const starter = createScriptedStarter([
      { delayBeforeFirstTextMilliseconds: 1, texts: [] },
      { delayBeforeFirstTextMilliseconds: 2, texts: [] },
    ]);

    const texts = await collectTexts(
      raceTextStreams({
        startTextStream: starter.startTextStream,
        streamCount: 2,
        signal: new AbortController().signal,
      }),
    );

    expect(texts).toEqual([]);
  });

  test('aborting from outside aborts the winner too', async () => {
    const outsideAbortController = new AbortController();
    const starter = createScriptedStarter([
      { delayBeforeFirstTextMilliseconds: 1, texts: ['first', 'second'] },
      { delayBeforeFirstTextMilliseconds: 50, texts: ['late'] },
    ]);
    const race = raceTextStreams({
      startTextStream: starter.startTextStream,
      streamCount: 2,
      signal: outsideAbortController.signal,
    });

    for await (const text of race) {
      expect(text).toBe('first');
      outsideAbortController.abort();
      break;
    }

    expect(starter.abortedStreamIndexes).toEqual(expect.arrayContaining([0, 1]));
  });
});
