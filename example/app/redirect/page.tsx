import { redirect } from 'next/navigation';

/**
 * `redirect()` throws an error Next.js handles itself, so nothing is sent to Hawk
 */
export const dynamic = 'force-dynamic';

export default function Redirect(): never {
  redirect('/');
}
