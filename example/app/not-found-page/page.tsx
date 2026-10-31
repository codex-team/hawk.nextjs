import { notFound } from 'next/navigation';

/**
 * `notFound()` throws an error Next.js handles itself, so nothing is sent to Hawk
 */
export const dynamic = 'force-dynamic';

export default function NotFoundPage(): never {
  notFound();
}
