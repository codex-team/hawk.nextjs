/**
 * Waits for the promises to settle, but no longer than the timeout
 * @param promises - promises to wait for
 * @param timeout - max time to wait, in milliseconds
 * @returns false when the timeout is reached
 */
export async function settleWithTimeout(promises: Iterable<Promise<unknown>>, timeout: number): Promise<boolean> {
  const list = [...promises];

  if (list.length === 0) {
    return true;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutReached = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeout);
  });
  const allSettled = Promise.allSettled(list).then(() => true);

  try {
    return await Promise.race([allSettled, timeoutReached]);
  } finally {
    clearTimeout(timer);
  }
}
