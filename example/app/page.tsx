import Link from 'next/link';
import { ErrorButton } from './error-button';

export default function Home() {
  return (
    <main>
      <h1>Hawk Next.js example</h1>
      <p>Release: <code>{process.env.HAWK_RELEASE}</code></p>
      <ErrorButton />
      <p><Link href="/posts/hello">Dynamic route</Link></p>
      <p><Link href="/server-error">Server error</Link></p>
    </main>
  );
}
