/**
 * Runs jobs at the same time but delivers their output in the order they started. A job's
 * items are held while an earlier job is still delivering, then flushed, then passed
 * straight through. Used so a later utterance's translation never overtakes an earlier one.
 */
export function createOrderedDelivery<Item>(deliver: (item: Item) => void) {
  let previousJobDelivered: Promise<void> = Promise.resolve();

  return {
    /** `produce` must not throw: turn failures into items so they are delivered in order too. */
    run(produce: () => AsyncIterable<Item>): Promise<void> {
      const heldItems: Item[] = [];
      let isThisJobsTurn = false;

      const production = (async () => {
        for await (const item of produce()) {
          if (isThisJobsTurn) {
            deliver(item);
          } else {
            heldItems.push(item);
          }
        }
      })();

      const thisJobDelivered = previousJobDelivered.then(async () => {
        // Flipping the flag and flushing in one synchronous step keeps the order exact.
        isThisJobsTurn = true;
        for (const item of heldItems.splice(0)) {
          deliver(item);
        }
        await production;
      });
      previousJobDelivered = thisJobDelivered.catch(() => {});
      return thisJobDelivered;
    },
  };
}
