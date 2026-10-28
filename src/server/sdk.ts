import type { BreadcrumbsAPI } from '@hawk.so/core';
import { isLoggerSet, log, setLogger } from '@hawk.so/core';
import type { AffectedUser, EventContext } from '@hawk.so/types';
import { getCarrier } from '../common/carrier';
import { isNextControlFlowError } from '../common/control-flow';
import { normalizeError } from '../common/error';
import type { HawkInitOptions } from '../common/options';
import { DEFAULT_FLUSH_TIMEOUT } from '../common/options';
import type { RequestErrorContext, RequestErrorRequest } from '../common/request';
import { getRequestAddons } from '../common/request';
import type { CaptureOptions } from './catcher';
import { ServerCatcher } from './catcher';

/**
 * Request context Next.js and Vercel expose to keep a serverless function alive after the response
 */
interface RequestContext {
  /**
   * Keeps the function alive until the promise is settled
   */
  waitUntil?: (promise: Promise<unknown>) => void;
}

/**
 * Key of the request context accessor in `globalThis`
 */
const REQUEST_CONTEXT_KEY = Symbol.for('@next/request-context');

/**
 * `globalThis` with the request context accessor set by Next.js
 */
interface GlobalWithRequestContext {
  /**
   * Returns the context of the current request
   */
  [REQUEST_CONTEXT_KEY]?: {
    /**
     * Returns the context or undefined outside of a request
     */
    get?: () => RequestContext | undefined;
  };
}

/**
 * Breadcrumbs API used before `init()`
 */
const noopBreadcrumbs: BreadcrumbsAPI = {
  add: () => undefined,
  get: () => [],
  clear: () => undefined,
};

/**
 * Shows if the `setUser` warning was printed
 */
let isSetUserWarningShown = false;

/**
 * Returns the catcher created by `init()`
 */
function getCatcher(): ServerCatcher | undefined {
  return getCarrier<ServerCatcher>().catcher;
}

/**
 * Prints core catcher messages to the server console
 */
function setConsoleLogger(): void {
  if (isLoggerSet()) {
    return;
  }

  setLogger((message, type = 'log', args) => {
    const method = type === 'warn' || type === 'error' || type === 'info' ? type : 'log';
    const text = `🦅 Hawk | ${message}`;

    if (args === undefined) {
      console[method](text);
    } else {
      console[method](text, args);
    }
  });
}

/**
 * Returns the token from the environment. NEXT_PUBLIC_HAWK_TOKEN is inlined by Next.js during the build
 */
function getEnvToken(): string | undefined {
  return [process.env.HAWK_TOKEN, process.env.NEXT_PUBLIC_HAWK_TOKEN].find(value => value !== undefined && value !== '');
}

/**
 * Passes the promise to `waitUntil` of the current request, if the platform supports it
 * @param promise - sending of the event
 */
function waitUntil(promise: Promise<unknown>): void {
  (globalThis as GlobalWithRequestContext)[REQUEST_CONTEXT_KEY]?.get?.()?.waitUntil?.(promise);
}

/**
 * Creates the server catcher
 * @param options - token, release and other settings passed to `init()`
 * @param runtime - current runtime: `nodejs` or `edge`
 * @returns created catcher or undefined when it is already created or can't be created
 */
export function initServerCatcher(options: HawkInitOptions, runtime: string): ServerCatcher | undefined {
  const carrier = getCarrier<ServerCatcher>();

  if (carrier.catcher !== undefined) {
    return undefined;
  }

  setConsoleLogger();

  const token = options.token ?? getEnvToken();

  if (token === undefined || token === '') {
    log('Integration Token is not provided, errors will not be sent. Set NEXT_PUBLIC_HAWK_TOKEN or pass `token` to init()', 'warn');

    return undefined;
  }

  try {
    carrier.catcher = new ServerCatcher({
      token,
      release: options.release ?? process.env.HAWK_RELEASE,
      context: options.context,
      beforeSend: options.beforeSend,
      collectorEndpoint: options.collectorEndpoint,
      runtime,
    });
  } catch (_error) {
    log('Invalid Integration Token, errors will not be sent', 'error');

    return undefined;
  }

  const { catcher } = carrier;

  carrier.capture = (error, addons): void => {
    void catcher.capture(normalizeError(error), { addons });
  };

  return catcher;
}

/**
 * Sends the error, skipping Next.js control flow errors
 * @param error - thrown value
 * @param options - context, user and Next.js data of the event
 * @returns promise resolved when the event is passed to the transport
 */
export async function captureServerError(error: unknown, options: CaptureOptions = {}): Promise<void> {
  const catcher = getCatcher();

  if (catcher === undefined || isNextControlFlowError(error)) {
    return;
  }

  await catcher.capture(normalizeError(error), options);
}

/**
 * Sends the error or message to Hawk. Next.js errors of `redirect()` and `notFound()` are skipped
 * @param error - error or message
 * @param context - data sent with the event
 * @param user - user affected by the error, used on the server only. In the browser use `setUser()`
 */
export function send(error: unknown, context?: EventContext, user?: AffectedUser): void {
  void captureServerError(error, {
    context,
    user,
  });
}

/**
 * Sets the user sent with every event in the browser.
 * Ignored on the server: it handles requests of many users at once, so pass the user to `send()` there
 * @param _user - current user
 */
export function setUser(_user: AffectedUser): void {
  if (!isSetUserWarningShown) {
    isSetUserWarningShown = true;
    log('setUser() is ignored on the server, pass the user to send() instead', 'warn');
  }
}

/**
 * Removes the user set with `setUser()`. Does nothing on the server
 */
export function clearUser(): void {
  /* No current user on the server */
}

/**
 * Sets data sent with every event. On the server it is shared by all requests of the process
 * @param context - data to send
 */
export function setContext(context: EventContext | undefined): void {
  getCatcher()?.setContext(context);
}

/**
 * Breadcrumbs sent with the events: actions that happened before the error.
 * Collected in the browser only: on the server requests of different users would be mixed
 */
export const breadcrumbs: BreadcrumbsAPI = noopBreadcrumbs;

/**
 * Waits for the events in progress, e.g. before a serverless function is frozen.
 * `onRequestError` already waits for its events. In the browser resolves at once
 * @param timeout - max time to wait, in milliseconds
 * @returns false when the timeout is reached or the catcher is not created
 */
export async function flush(timeout = DEFAULT_FLUSH_TIMEOUT): Promise<boolean> {
  const catcher = getCatcher();

  return catcher === undefined ? false : catcher.flush(timeout);
}

/**
 * Sends errors of server components, route handlers, server actions and middleware, on the server only.
 * Export it from `instrumentation.ts`: `export const onRequestError = Hawk.onRequestError`
 * @param error - caught error
 * @param request - failed request
 * @param context - route data
 */
export async function onRequestError(error: unknown, request: Readonly<RequestErrorRequest>, context: Readonly<RequestErrorContext>): Promise<void> {
  const catcher = getCatcher();

  if (catcher === undefined || isNextControlFlowError(error)) {
    return;
  }

  const sending = captureServerError(error, {
    addons: getRequestAddons(error, request, context),
  }).then(() => catcher.flush(DEFAULT_FLUSH_TIMEOUT));

  waitUntil(sending);

  await sending;
}

/**
 * Adds a breadcrumb for every navigation of the App Router, in the browser only.
 * Export it from `instrumentation-client.ts`: `export const onRouterTransitionStart = Hawk.onRouterTransitionStart`
 * @param _url - target URL
 * @param _navigationType - `push`, `replace` or `traverse`
 */
export function onRouterTransitionStart(_url: string, _navigationType: string): void {
  /* Browser only */
}
