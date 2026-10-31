import type { HawkInitOptions } from '../common/options';
import { captureServerError, flush, initServerCatcher } from './sdk';

export { breadcrumbs, clearUser, flush, onRequestError, onRouterTransitionStart, send, setContext, setUser } from './sdk';
export { HawkErrorBoundary, HawkGlobalError, useHawkError } from '../react';
export type * from '../common/types';

/**
 * Process events handled by the catcher
 */
type ProcessErrorEvent = 'uncaughtException' | 'unhandledRejection';

/**
 * Sends the uncaught error. Next.js server logs such errors and keeps the process alive.
 * When nothing else listens to the event, Node.js default is kept: the process exits after sending
 * @param event - process event name
 * @param error - uncaught error or rejection reason
 */
async function handleProcessError(event: ProcessErrorEvent, error: unknown): Promise<void> {
  await captureServerError(error);
  await flush();

  if (process.listenerCount(event) === 1) {
    console.error(error);
    // eslint-disable-next-line n/no-process-exit -- keeps Node.js behavior for uncaught errors
    process.exit(1);
  }
}

/**
 * Initializes Hawk. Call it in `instrumentation-client.ts` for the browser
 * and in `register()` of `instrumentation.ts` for the server
 * @param options - token, release and other options
 */
export function init(options: HawkInitOptions = {}): void {
  const catcher = initServerCatcher(options, 'nodejs');

  if (catcher === undefined || options.disableGlobalErrorsHandling === true) {
    return;
  }

  process.on('uncaughtException', (error) => {
    void handleProcessError('uncaughtException', error);
  });
  process.on('unhandledRejection', (reason) => {
    void handleProcessError('unhandledRejection', reason);
  });
}
