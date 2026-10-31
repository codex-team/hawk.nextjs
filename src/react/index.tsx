'use client';

import type { CSSProperties, ErrorInfo, ReactElement, ReactNode } from 'react';
import { Component, useEffect } from 'react';
import { getCarrier } from '../common/carrier';
import { getDigest, isNextControlFlowError } from '../common/control-flow';

/**
 * Error passed by Next.js to the error pages
 */
type ErrorWithDigest = Error & {
  /**
   * Digest of the server error. Server errors have a generic message in production
   */
  digest?: string;
};

/**
 * Props passed by Next.js to `error.tsx` and `global-error.tsx`
 */
export interface HawkErrorPageProps {
  /**
   * Caught error
   */
  error: ErrorWithDigest;

  /**
   * Renders the segment again
   */
  reset?: () => void;
}

/**
 * Props passed to the fallback of `HawkErrorBoundary`
 */
export interface HawkErrorBoundaryFallbackProps {
  /**
   * Caught error
   */
  error: unknown;

  /**
   * Renders the children again
   */
  reset: () => void;
}

/**
 * Content, fallback and error callback of `HawkErrorBoundary`
 */
export interface HawkErrorBoundaryProps {
  /**
   * Content to protect
   */
  children?: ReactNode;

  /**
   * Shown instead of the children after an error
   */
  fallback?: ReactNode | ((props: HawkErrorBoundaryFallbackProps) => ReactNode);

  /**
   * Called after the error is sent
   */
  onError?: (error: unknown, info: ErrorInfo) => void;
}

/**
 * Whether `HawkErrorBoundary` shows the fallback, and the error it caught
 */
interface HawkErrorBoundaryState {
  /**
   * Whether an error is caught
   */
  hasError: boolean;

  /**
   * Caught error
   */
  error: unknown;
}

/**
 * Sends the error caught by an error boundary
 * @param error - caught error
 * @param boundary - `error`, `global-error` or `boundary`
 * @param componentStack - React component stack
 */
function captureBoundaryError(error: unknown, boundary: string, componentStack?: string | null): void {
  /**
   * Errors with a digest come from the server and are sent by `onRequestError`
   */
  if (isNextControlFlowError(error) || getDigest(error) !== undefined) {
    return;
  }

  getCarrier().capture?.(error, {
    boundary,
    ...(typeof componentStack === 'string' ? { componentStack } : {}),
  });
}

/**
 * Sends the error shown by `error.tsx` to Hawk.
 * Next.js only logs errors caught by error boundaries, so the catcher doesn't get them otherwise
 * @param error - error passed to the error page
 */
export function useHawkError(error: unknown): void {
  useEffect(() => {
    captureBoundaryError(error, 'error');
  }, [error]);
}

/**
 * Styles of the global error page, close to the default Next.js one
 */
const globalErrorStyles: Record<'container' | 'title' | 'digest' | 'button', CSSProperties> = {
  container: {
    fontFamily: 'system-ui, sans-serif',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    textAlign: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: 400,
    margin: 0,
  },
  digest: {
    fontSize: 12,
    opacity: 0.6,
    margin: 0,
  },
  button: {
    fontSize: 14,
    padding: '6px 14px',
    cursor: 'pointer',
  },
};

/**
 * Ready `app/global-error.tsx`: sends the error and shows a minimal error page.
 * Use it as `export { HawkGlobalError as default } from '@hawk.so/nextjs'`
 * @param props - props passed by Next.js
 */
export function HawkGlobalError({ error, reset }: HawkErrorPageProps): ReactElement {
  useEffect(() => {
    captureBoundaryError(error, 'global-error');
  }, [error]);

  const side = error.digest === undefined ? 'client' : 'server';

  return (
    <html lang="en">
      <body>
        <main style={globalErrorStyles.container}>
          <h2 style={globalErrorStyles.title}>Application error: a {side}-side exception has occurred.</h2>
          {error.digest !== undefined && <p style={globalErrorStyles.digest}>Digest: {error.digest}</p>}
          {reset !== undefined && (
            <button type="button" style={globalErrorStyles.button} onClick={reset}>
              Try again
            </button>
          )}
        </main>
      </body>
    </html>
  );
}

/**
 * Error boundary that sends errors of its children to Hawk and shows the fallback.
 * Errors Next.js uses for `redirect()` and `notFound()` are passed to the Next.js boundaries
 */
export class HawkErrorBoundary extends Component<HawkErrorBoundaryProps, HawkErrorBoundaryState> {
  /**
   * Initial state
   */
  public override state: HawkErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  /**
   * Shows the fallback after an error
   * @param error - caught error
   */
  public static getDerivedStateFromError(error: unknown): HawkErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  /**
   * Sends the caught error
   * @param error - caught error
   * @param info - component stack
   */
  public override componentDidCatch(error: unknown, info: ErrorInfo): void {
    if (isNextControlFlowError(error)) {
      return;
    }

    captureBoundaryError(error, 'boundary', info.componentStack);
    this.props.onError?.(error, info);
  }

  /**
   * Renders the children again
   */
  public reset = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  /**
   * Renders the children or the fallback
   */
  public override render(): ReactNode {
    const { hasError, error } = this.state;

    if (!hasError) {
      return this.props.children;
    }

    /**
     * Rethrown to the Next.js boundaries that handle redirects and not found pages
     */
    if (isNextControlFlowError(error)) {
      throw error;
    }

    const { fallback } = this.props;

    if (typeof fallback === 'function') {
      return fallback({
        error,
        reset: this.reset,
      });
    }

    return fallback ?? null;
  }
}
