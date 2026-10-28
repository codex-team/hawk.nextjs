import type { Transport } from '@hawk.so/core';
import type { CatcherMessage } from '@hawk.so/types';
import { settleWithTimeout } from '../common/timeout';

/**
 * Timeout of a single request to the collector, in milliseconds
 */
const REQUEST_TIMEOUT = 10_000;

/**
 * Sends events to the collector over HTTP with `fetch`, so it works in Node.js and in the Edge runtime.
 * Keeps requests in progress, so the caller can wait for them before a serverless function is frozen
 */
export class FetchTransport implements Transport<'errors/nodejs'> {
  /**
   * Collector endpoint
   */
  private readonly endpoint: string;

  /**
   * Requests in progress
   */
  private readonly pending = new Set<Promise<void>>();

  /**
   * @param endpoint - collector endpoint, e.g. `https://<integration id>.k1.hawk.so/`
   */
  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  /**
   * Sends the event
   * @param message - event with the token and the catcher type
   */
  public send(message: CatcherMessage<'errors/nodejs'>): Promise<void> {
    const request = this.post(message).finally(() => {
      this.pending.delete(request);
    });

    this.pending.add(request);

    return request;
  }

  /**
   * Waits for the requests in progress
   * @param timeout - max time to wait, in milliseconds
   * @returns false when the timeout is reached
   */
  public flush(timeout: number): Promise<boolean> {
    return settleWithTimeout(this.pending, timeout);
  }

  /**
   * Posts the event to the collector
   * @param message - event with the token and the catcher type
   */
  private async post(message: CatcherMessage<'errors/nodejs'>): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: [['Content-Type', 'application/json']],
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Collector responded with ${response.status} ${response.statusText}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
