import { getDigest } from './control-flow';

/**
 * Request passed by Next.js to `onRequestError`
 */
export interface RequestErrorRequest {
  /**
   * Request path with the query string
   */
  path: string;

  /**
   * HTTP method
   */
  method: string;

  /**
   * Request headers
   */
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Context passed by Next.js to `onRequestError`. Fields differ between Next.js versions, so they are loose strings
 */
export interface RequestErrorContext {
  /**
   * `App Router` or `Pages Router`
   */
  routerKind: string;

  /**
   * Route file path, e.g. `/blog/[slug]`
   */
  routePath: string;

  /**
   * `render`, `route`, `action`, `middleware` or `proxy`
   */
  routeType: string;

  /**
   * Rendering phase of the App Router
   */
  renderSource?: string;

  /**
   * Revalidation reason: `on-demand` or `stale`
   */
  revalidateReason?: string;

  /**
   * Render type of the App Router in Next.js 15: `dynamic` or `dynamic-resume`
   */
  renderType?: string;
}

/**
 * Next.js data sent with events in `addons.nextjs`
 */
export interface NextjsAddons {
  /**
   * Where the error happened: `nodejs`, `edge` or `browser`
   */
  runtime?: string;

  /**
   * Error page that caught the error: `error`, `global-error` or `boundary`
   */
  boundary?: string;

  /**
   * React component stack of the error caught by `HawkErrorBoundary`
   */
  componentStack?: string;

  /**
   * Digest of the server error. The same digest is shown on the error page in the browser
   */
  digest?: string;

  /**
   * `App Router` or `Pages Router`
   */
  routerKind?: string;

  /**
   * Route file path, e.g. `/blog/[slug]`
   */
  routePath?: string;

  /**
   * `render`, `route`, `action`, `middleware` or `proxy`
   */
  routeType?: string;

  /**
   * Rendering phase of the App Router
   */
  renderSource?: string;

  /**
   * Revalidation reason
   */
  revalidateReason?: string;

  /**
   * Render type of the App Router
   */
  renderType?: string;

  /**
   * HTTP method
   */
  method?: string;

  /**
   * Request path with the query string
   */
  path?: string;

  /**
   * Request headers that don't contain credentials
   */
  headers?: Record<string, string>;
}

/**
 * Request headers sent with events. Cookies, authorization and client IP are skipped
 */
const SAFE_HEADERS = ['host', 'referer', 'user-agent'];

/**
 * Returns request headers that are safe to send
 * @param headers - all request headers
 */
function pickSafeHeaders(headers: RequestErrorRequest['headers']): Record<string, string> {
  const result: Record<string, string> = {};

  for (const name of SAFE_HEADERS) {
    const value = headers[name];

    if (value !== undefined) {
      result[name] = Array.isArray(value) ? value.join(', ') : value;
    }
  }

  return result;
}

/**
 * Returns Next.js data of the failed request
 * @param error - error passed to `onRequestError`
 * @param request - request passed to `onRequestError`
 * @param context - context passed to `onRequestError`
 */
export function getRequestAddons(error: unknown, request: Readonly<RequestErrorRequest>, context: Readonly<RequestErrorContext>): NextjsAddons {
  const addons: NextjsAddons = {
    digest: getDigest(error),
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason,
    renderType: context.renderType,
    method: request.method,
    path: request.path,
    headers: pickSafeHeaders(request.headers),
  };

  return Object.fromEntries(Object.entries(addons).filter(([, value]) => value !== undefined));
}
