import type { HawkInitOptions } from '../common/options';
import { initServerCatcher } from './sdk';

export { breadcrumbs, clearUser, flush, onRequestError, onRouterTransitionStart, send, setContext, setUser } from './sdk';
export { HawkErrorBoundary, HawkGlobalError, useHawkError } from '../react';
export type * from '../common/types';

/**
 * Initializes Hawk in the Edge runtime. Call it in `register()` of `instrumentation.ts`.
 * The Edge runtime has no process events, so only errors passed to `onRequestError` and `send()` are sent
 * @param options - token, release and other options
 */
export function init(options: HawkInitOptions = {}): void {
  initServerCatcher(options, 'edge');
}
