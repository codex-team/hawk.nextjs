'use client';

/**
 * Throws an error on click, so you can check the source-mapped stack trace in Hawk
 */
export function ErrorButton() {
  const throwError = (): void => {
    throw new Error('Hawk Next.js example error');
  };

  return (
    <button type="button" onClick={throwError}>
      Throw an error
    </button>
  );
}
