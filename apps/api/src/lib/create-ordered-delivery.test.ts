import { describe, expect, test } from 'bun:test';
import { createOrderedDelivery } from './create-ordered-delivery';

async function* produceSlowly(label: string, itemCount: number, delayMilliseconds: number) {
  for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
    await Bun.sleep(delayMilliseconds);
    yield `${label}${itemIndex}`;
  }
}

describe('createOrderedDelivery', () => {
  test('a later job that finishes first is delivered after the earlier one', async () => {
    const deliveredItems: string[] = [];
    const orderedDelivery = createOrderedDelivery<string>((item) => deliveredItems.push(item));

    const slowJob = orderedDelivery.run(() => produceSlowly('slow', 3, 30));
    const fastJob = orderedDelivery.run(() => produceSlowly('fast', 3, 1));
    await Promise.all([slowJob, fastJob]);

    expect(deliveredItems).toEqual(['slow0', 'slow1', 'slow2', 'fast0', 'fast1', 'fast2']);
  });

  test('the first job streams straight through', async () => {
    const deliveredItems: string[] = [];
    const orderedDelivery = createOrderedDelivery<string>((item) => deliveredItems.push(item));

    const job = orderedDelivery.run(() => produceSlowly('first', 3, 20));
    await Bun.sleep(30);

    expect(deliveredItems).toEqual(['first0']);
    await job;
  });

  test('ten jobs with random speeds arrive in order', async () => {
    const deliveredItems: string[] = [];
    const orderedDelivery = createOrderedDelivery<string>((item) => deliveredItems.push(item));
    const delaysMilliseconds = [9, 1, 7, 3, 5, 2, 8, 4, 6, 1];

    await Promise.all(
      delaysMilliseconds.map((delayMilliseconds, jobIndex) =>
        orderedDelivery.run(() => produceSlowly(`job${jobIndex}-`, 2, delayMilliseconds)),
      ),
    );

    expect(deliveredItems).toEqual(
      delaysMilliseconds.flatMap((_, jobIndex) => [`job${jobIndex}-0`, `job${jobIndex}-1`]),
    );
  });
});
