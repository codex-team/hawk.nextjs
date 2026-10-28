import { describe, expect, it } from 'vitest';
import { mapConcurrently } from '../src/utils/pool';

describe('mapConcurrently', () => {
  it('returns results in the order of items with at most `limit` calls in progress', async () => {
    let inProgress = 0;
    let maxInProgress = 0;

    const results = await mapConcurrently([5, 1, 4, 2, 3, 0], 2, async (delay) => {
      inProgress += 1;
      maxInProgress = Math.max(maxInProgress, inProgress);
      await new Promise(resolve => setTimeout(resolve, delay));
      inProgress -= 1;

      return delay * 10;
    });

    expect(results).toEqual([50, 10, 40, 20, 30, 0]);
    expect(maxInProgress).toBe(2);
  });

  it('returns empty list for no items', async () => {
    expect(await mapConcurrently([], 4, () => Promise.resolve(1))).toEqual([]);
  });

  it('rejects when the mapper throws', async () => {
    await expect(mapConcurrently([1, 2], 2, item => (item === 2 ? Promise.reject(new Error('Failed')) : Promise.resolve(item)))).rejects.toThrow('Failed');
  });
});
