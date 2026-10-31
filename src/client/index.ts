import type { BreadcrumbsAPI, HawkInitialSettings, HawkJavaScriptEvent, JavaScriptCatcherIntegrations } from '@hawk.so/browser';
import HawkCatcher from '@hawk.so/browser';
import { log } from '@hawk.so/core';
import type { AffectedUser, EventContext } from '@hawk.so/types';
import { getCarrier } from '../common/carrier';
import { isNextControlFlowError, isNextControlFlowTitle } from '../common/control-flow';
import { normalizeError } from '../common/error';
import type { HawkInitOptions } from '../common/options';
import type { NextjsAddons, RequestErrorContext, RequestErrorRequest } from '../common/request';

export { HawkErrorBoundary, HawkGlobalError, useHawkError } from '../react';
export type * from '../common/types';

/**
 * Shows if the `send()` user warning was printed
 */
let isUserWarningShown = false;

/**
 * Returns the catcher created by `init()`
 */
function getCatcher(): HawkCatcher | undefined {
  return getCarrier<HawkCatcher>().catcher;
}

/**
 * Sends the error with Next.js data
 * @param catcher - browser catcher
 * @param error - thrown value
 * @param addons - Next.js data of the event
 */
function captureWithAddons(catcher: HawkCatcher, error: unknown, addons: NextjsAddons): void {
  const integrations = {
    nextjs: {
      runtime: 'browser',
      ...addons,
    },
  };

  catcher.captureError(normalizeError(error), integrations as unknown as JavaScriptCatcherIntegrations);
}

/**
 * Initializes Hawk in the browser. Call it in `instrumentation-client.ts`
 * @param options - token, release and other options
 */
export function init(options: HawkInitOptions = {}): void {
  const carrier = getCarrier<HawkCatcher>();

  if (carrier.catcher !== undefined) {
    return;
  }

  const { beforeSend, ...settings } = options;
  const token = options.token ?? process.env.NEXT_PUBLIC_HAWK_TOKEN;

  if (token === undefined || token === '') {
    log('Integration Token is not provided, errors will not be sent. Set NEXT_PUBLIC_HAWK_TOKEN or pass `token` to init()', 'warn');

    return;
  }

  const filter = (event: HawkJavaScriptEvent): HawkJavaScriptEvent | false | void => {
    if (isNextControlFlowTitle(event.title)) {
      return false;
    }

    return beforeSend === undefined ? event : beforeSend(event) as HawkJavaScriptEvent | false | void;
  };

  const catcher = new HawkCatcher({
    ...settings,
    token,
    release: options.release ?? process.env.HAWK_RELEASE,
    beforeSend: filter,
  } satisfies HawkInitialSettings);

  carrier.catcher = catcher;
  carrier.capture = (error, addons): void => {
    captureWithAddons(catcher, error, addons);
  };
}

/**
 * Sends the error or message to Hawk
 * @param error - error or message
 * @param context - data sent with the event
 * @param user - not supported in the browser, use `setUser()`
 */
export function send(error: unknown, context?: EventContext, user?: AffectedUser): void {
  if (user !== undefined && !isUserWarningShown) {
    isUserWarningShown = true;
    log('The user passed to send() is ignored in the browser, use setUser() instead', 'warn');
  }

  if (isNextControlFlowError(error)) {
    return;
  }

  getCatcher()?.send(normalizeError(error), context);
}

/**
 * Sets the user sent with every event
 * @param user - current user
 */
export function setUser(user: AffectedUser): void {
  getCatcher()?.setUser(user);
}

/**
 * Removes the user set with `setUser()`
 */
export function clearUser(): void {
  getCatcher()?.clearUser();
}

/**
 * Sets data sent with every event
 * @param context - data to send
 */
export function setContext(context: EventContext | undefined): void {
  getCatcher()?.setContext(context);
}

/**
 * Breadcrumbs sent with the events: actions that happened before the error
 */
export const breadcrumbs: BreadcrumbsAPI = {
  add: (breadcrumb, hint) => getCatcher()?.breadcrumbs.add(breadcrumb, hint),
  get: () => getCatcher()?.breadcrumbs.get() ?? [],
  clear: () => getCatcher()?.breadcrumbs.clear(),
};

/**
 * The browser catcher sends events over a WebSocket and doesn't wait for them
 * @param _timeout - ignored
 */
export function flush(_timeout?: number): Promise<boolean> {
  return Promise.resolve(true);
}

/**
 * Request errors happen on the server only
 * @param _error - caught error
 * @param _request - failed request
 * @param _context - route data
 */
export function onRequestError(_error: unknown, _request: Readonly<RequestErrorRequest>, _context: Readonly<RequestErrorContext>): Promise<void> {
  return Promise.resolve();
}

/**
 * Adds a breadcrumb for every navigation of the App Router.
 * Export it from `instrumentation-client.ts`: `export const onRouterTransitionStart = Hawk.onRouterTransitionStart`
 * @param url - target URL
 * @param navigationType - `push`, `replace` or `traverse`
 */
export function onRouterTransitionStart(url: string, navigationType: string): void {
  getCatcher()?.breadcrumbs.add({
    type: 'navigation',
    category: 'next.router',
    message: url,
    level: 'info',
    data: { navigationType },
  });
}
