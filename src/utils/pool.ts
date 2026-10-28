/**
 * Calls the mapper for every item keeping at most `limit` calls in progress
 * @param items - items to process
 * @param limit - max number of simultaneously running calls
 * @param mapper - async handler for a single item. One rejection fails the whole run
 * @returns results in the order of items
 */
export async function mapConcurrently<Item, Result>(
  items: readonly Item[],
  limit: number,
  mapper: (item: Item) => Promise<Result>
): Promise<Result[]> {
  const results: Result[] = [];
  let nextIndex = 0;

  const runWorker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;

      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  };

  const workersCount = Math.max(1, Math.min(limit, items.length));

  await Promise.all(Array.from({ length: workersCount }, runWorker));

  return results;
}
