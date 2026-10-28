'use client';

import { useEffect } from 'react';

/**
 * Errors caught by an error boundary are only logged to the console by Next.js.
 * `reportError` reports them as uncaught, so the browser catcher sends them to Hawk.
 * Server errors have a `digest` and are already sent from `onRequestError` in instrumentation.ts
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (error.digest === undefined) {
      reportError(error);
    }
  }, [error]);

  return (
    <main>
      <h1>Something went wrong</h1>
      <button type="button" onClick={reset}>Try again</button>
    </main>
  );
}
