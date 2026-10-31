import type { Commit } from './commits';

/**
 * Where and how to send the release data
 */
export interface Collector {
  /**
   * Collector URL for releases
   */
  endpoint: string;

  /**
   * Hawk Integration Token
   */
  token: string;

  /**
   * Release id
   */
  release: string;

  /**
   * Request timeout in milliseconds
   */
  timeout: number;
}

/**
 * Collector response body
 */
interface CollectorResponse {
  /**
   * True when the request was rejected
   */
  error?: boolean;

  /**
   * Result description
   */
  message?: string;
}

/**
 * Max length of the unexpected response body printed in the error message
 */
const MAX_RESPONSE_PREVIEW_LENGTH = 200;

/**
 * The collector appends the decoded token secret to the "invalid token" message.
 * Cut it off, so the secret does not get to the build logs
 * @param message - error description from the collector response
 */
function sanitizeCollectorMessage(message: string): string {
  return message.startsWith('Integration token invalid') ? 'Integration token invalid' : message;
}

/**
 * Sends the form to the collector.
 * The collector may reply with HTTP 200 and `error: true`, so the response body is checked as well
 * @param collector - endpoint, token and release to send the form with
 * @param body - multipart form with the release data
 */
async function send(collector: Collector, body: FormData): Promise<void> {
  const response = await fetch(collector.endpoint, {
    method: 'POST',
    body,
    headers: [['Authorization', `Bearer ${collector.token}`]],
    signal: AbortSignal.timeout(collector.timeout),
  });

  const text = await response.text();
  let data: CollectorResponse;

  try {
    data = JSON.parse(text) as CollectorResponse;
  } catch (_error) {
    throw new Error(`Unexpected collector response (HTTP ${response.status}): ${text.slice(0, MAX_RESPONSE_PREVIEW_LENGTH)}`);
  }

  if (data.error === true || !response.ok) {
    throw new Error(sanitizeCollectorMessage(data.message ?? `HTTP ${response.status}`));
  }
}

/**
 * Sends a single source map to Hawk
 * @param collector - endpoint, token and release to send the map with
 * @param name - file name of the map, e.g. `0a1b2c.js.map`
 * @param content - source map JSON
 */
export async function sendSourceMap(collector: Collector, name: string, content: string): Promise<void> {
  const body = new FormData();

  body.set('release', collector.release);
  body.set('file', new Blob([content], { type: 'application/json' }), name);

  await send(collector, body);
}

/**
 * Sends recent commits of the release to Hawk
 * @param collector - endpoint, token and release to send the commits with
 * @param commits - recent commits, newest first
 */
export async function sendCommits(collector: Collector, commits: Commit[]): Promise<void> {
  const body = new FormData();

  body.set('release', collector.release);
  body.set('commits', JSON.stringify(commits));

  await send(collector, body);
}
