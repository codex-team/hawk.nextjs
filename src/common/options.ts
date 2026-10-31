import type { HawkInitialSettings } from '@hawk.so/browser';
import type { CatcherMessagePayload, EventContext } from '@hawk.so/types';

/**
 * Event passed to `beforeSend`: from the browser or from the server
 */
export type HawkEvent = CatcherMessagePayload<'errors/javascript'> | CatcherMessagePayload<'errors/nodejs'>;

/**
 * Options of `init()`. The same options are accepted in the browser and on the server,
 * options of the browser catcher are ignored on the server
 */
export interface HawkInitOptions extends Pick<HawkInitialSettings, 'user' | 'debug' | 'breadcrumbs' | 'consoleTracking' | 'issues' | 'reconnectionTimeout' | 'transport'> {
  /**
   * Hawk Integration Token. Default is the NEXT_PUBLIC_HAWK_TOKEN environment variable,
   * on the server HAWK_TOKEN is checked first
   */
  token?: string;

  /**
   * Release id. Default is `process.env.HAWK_RELEASE` set by `withHawkConfig`
   */
  release?: string;

  /**
   * Collector endpoint overwrite: WebSocket URL in the browser, HTTP URL on the server
   */
  collectorEndpoint?: string;

  /**
   * Data sent with every event
   */
  context?: EventContext;

  /**
   * Filters or modifies events before sending. Return the event to send it or `false` to drop it
   */
  beforeSend?: (event: HawkEvent) => HawkEvent | false | void;

  /**
   * Disables catching of uncaught errors and unhandled rejections: `window` handlers in the browser,
   * `process` handlers in Node.js
   */
  disableGlobalErrorsHandling?: boolean;
}

/**
 * Default time to wait for sending events, in milliseconds
 */
export const DEFAULT_FLUSH_TIMEOUT = 2000;
