'use client';

import { useHawkError } from '@hawk.so/nextjs';

/**
 * Errors caught by an error boundary are only logged to the console by Next.js, `useHawkError` sends them.
 * Server errors have a `digest` and are skipped: they are already sent from `onRequestError`
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useHawkError(error);

  return (
    <main>
      <h1>Something went wrong</h1>
      <button type="button" onClick={reset}>Try again</button>
    </main>
  );
}
