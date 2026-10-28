/**
 * Rendered on request, so the error is thrown by the server at runtime, not during the build
 */
export const dynamic = 'force-dynamic';

export default function ServerError(): never {
  throw new Error('Hawk Next.js example server error');
}
