'use server';

/**
 * Server action that fails: the error is sent from `onRequestError`
 */
export async function failingAction(): Promise<void> {
  throw new Error('Hawk Next.js example server action error');
}
