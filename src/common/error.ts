/**
 * Fields of an error thrown in another realm, e.g. in the Edge runtime sandbox of `next dev`
 */
interface ErrorLike {
  /**
   * Error name
   */
  name?: unknown;

  /**
   * Error message
   */
  message: string;

  /**
   * Stack trace
   */
  stack?: unknown;
}

/**
 * Checks whether the value looks like an error
 * @param value - thrown value
 */
function isErrorLike(value: unknown): value is ErrorLike {
  return typeof value === 'object' && value !== null && typeof (value as ErrorLike).message === 'string' && typeof (value as ErrorLike).stack === 'string';
}

/**
 * Converts a thrown value to what the catchers accept: an error or a message.
 * Errors from another realm fail `instanceof Error`, so they are copied to get the stack trace parsed
 * @param value - thrown value, e.g. a rejection reason
 */
export function normalizeError(value: unknown): Error | string {
  if (value instanceof Error || typeof value === 'string') {
    return value;
  }

  if (isErrorLike(value)) {
    const error = new Error(value.message);

    error.name = typeof value.name === 'string' ? value.name : error.name;
    error.stack = value.stack as string;

    return error;
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch (_error) {
    return String(value);
  }
}
