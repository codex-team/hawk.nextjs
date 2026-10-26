/**
 * Runs the worker for every item keeping at most `limit` workers in progress
 * @param items - items to process
 * @param limit - max number of simultaneously running workers
 * @param worker - async handler for a single item. Should not throw: one rejection fails the whole run
 */
export async function forEachConcurrently<Item>(
  items: readonly Item[],
  limit: number,
  worker: (item: Item) => Promise<void>
): Promise<void> {
  let nextIndex = 0;

  const runWorker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];

      nextIndex += 1;
      await worker(item);
    }
  };

  const workersCount = Math.max(1, Math.min(limit, items.length));

  await Promise.all(Array.from({ length: workersCount }, runWorker));
}
