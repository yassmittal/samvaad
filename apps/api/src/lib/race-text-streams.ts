type Contender = {
  abortController: AbortController;
  textStream: AsyncGenerator<string>;
  firstResult: Promise<IteratorResult<string>>;
};

type FirstOutcome =
  | { kind: 'text'; contender: Contender; text: string }
  | { kind: 'ended_empty'; contender: Contender }
  | { kind: 'failed'; contender: Contender; error: unknown };

function findFirstOutcome(contender: Contender): Promise<FirstOutcome> {
  return contender.firstResult.then(
    (result): FirstOutcome =>
      result.done
        ? { kind: 'ended_empty', contender }
        : { kind: 'text', contender, text: result.value },
    (error: unknown): FirstOutcome => ({ kind: 'failed', contender, error }),
  );
}

/**
 * Starts `streamCount` copies of the same text stream at once and yields from whichever
 * produces text first; the others are aborted (D-020). A copy that fails or ends before any
 * text is dropped while another is still running. When every copy fails, the last error is
 * thrown; when they all end without text, so does this.
 */
export async function* raceTextStreams({
  startTextStream,
  streamCount,
  signal,
}: {
  startTextStream: (signal: AbortSignal) => AsyncGenerator<string>;
  streamCount: number;
  /** Aborts every copy, the winner included. */
  signal: AbortSignal;
}): AsyncGenerator<string> {
  const contenders: Contender[] = Array.from({ length: streamCount }, () => {
    const abortController = new AbortController();
    const textStream = startTextStream(AbortSignal.any([signal, abortController.signal]));
    return { abortController, textStream, firstResult: textStream.next() };
  });

  try {
    let remainingContenders = [...contenders];
    let lastError: unknown = null;
    while (remainingContenders.length > 0) {
      const outcome = await Promise.race(remainingContenders.map(findFirstOutcome));
      if (outcome.kind !== 'text') {
        if (outcome.kind === 'failed') {
          lastError = outcome.error;
        }
        remainingContenders = remainingContenders.filter(
          (contender) => contender !== outcome.contender,
        );
        continue;
      }

      for (const contender of contenders) {
        if (contender !== outcome.contender) {
          contender.abortController.abort();
        }
      }
      yield outcome.text;
      while (true) {
        const nextResult = await outcome.contender.textStream.next();
        if (nextResult.done) {
          return;
        }
        yield nextResult.value;
      }
    }
    if (lastError !== null) {
      throw lastError;
    }
  } finally {
    // Also when the reader stops early: nothing keeps running for an answer nobody reads.
    for (const contender of contenders) {
      contender.abortController.abort();
    }
  }
}
