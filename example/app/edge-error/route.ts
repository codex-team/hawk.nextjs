/**
 * Route handler in the Edge runtime. Its error is passed to `onRequestError`:
 * `next start` calls the Node.js one, Edge platforms call the Edge one
 */
export const runtime = 'edge';

export function GET(): Response {
  throw new Error('Hawk Next.js example edge error');
}
