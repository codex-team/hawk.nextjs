/**
 * Digests of the errors Next.js throws to control rendering, e.g. `NEXT_REDIRECT;replace;/login;307;`.
 * They are expected and handled by Next.js, so they are not sent to Hawk
 */
const CONTROL_FLOW_DIGEST_PREFIXES = [
  'NEXT_REDIRECT',
  'NEXT_HTTP_ERROR_FALLBACK;',
  'NEXT_NOT_FOUND',
  'BAILOUT_TO_CLIENT_SIDE_RENDERING',
  'DYNAMIC_SERVER_USAGE',
  'NEXT_PRERENDER_INTERRUPTED',
  'HANGING_PROMISE_REJECTION',
];

/**
 * Code of the error thrown when a static page uses dynamic APIs
 */
const STATIC_GEN_BAILOUT_CODE = 'NEXT_STATIC_GEN_BAILOUT';

/**
 * Type of the value thrown by React to postpone rendering in Partial Prerendering
 */
const REACT_POSTPONE_TYPE = Symbol.for('react.postpone');

/**
 * Max depth of the `cause` chain to check
 */
const MAX_CAUSE_DEPTH = 5;

/**
 * Fields of the thrown value used to detect control flow errors
 */
interface ThrownValue {
  /**
   * Digest Next.js adds to its errors and to server errors forwarded to the client
   */
  digest?: unknown;

  /**
   * Error code
   */
  code?: unknown;

  /**
   * React element type marker
   */
  $$typeof?: unknown;

  /**
   * Error message
   */
  message?: unknown;

  /**
   * Error that caused this one
   */
  cause?: unknown;
}

/**
 * Checks whether the string is a control flow digest
 * @param value - digest or error message
 */
function isControlFlowDigest(value: unknown): boolean {
  return typeof value === 'string' && CONTROL_FLOW_DIGEST_PREFIXES.some(prefix => value.startsWith(prefix));
}

/**
 * Checks whether the error is thrown by Next.js to control rendering: `redirect()`, `notFound()`, `forbidden()`,
 * dynamic rendering bailouts and so on. Such errors are part of the normal flow and are not sent to Hawk
 * @param error - thrown value
 */
export function isNextControlFlowError(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (typeof current !== 'object' || current === null) {
      return false;
    }

    const value = current as ThrownValue;

    if (isControlFlowDigest(value.digest) || isControlFlowDigest(value.message) || value.code === STATIC_GEN_BAILOUT_CODE || value.$$typeof === REACT_POSTPONE_TYPE) {
      return true;
    }

    current = value.cause;
  }

  return false;
}

/**
 * Checks whether the event title is a control flow digest.
 * Used in `beforeSend`, since global handlers of the browser catcher pass errors without a hook
 * @param title - event title, i.e. the error message
 */
export function isNextControlFlowTitle(title: string): boolean {
  return isControlFlowDigest(title);
}

/**
 * Returns the digest of the error: Next.js adds it to server errors, so the error page in the browser
 * can be matched with the event sent from the server
 * @param error - thrown value
 */
export function getDigest(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    const { digest } = error as ThrownValue;

    if (typeof digest === 'string' && digest !== '') {
      return digest;
    }
  }

  return undefined;
}
