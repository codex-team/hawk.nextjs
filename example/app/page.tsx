import Link from 'next/link';
import { ErrorButton } from './error-button';

export default function Home() {
  return (
    <main>
      <h1>Hawk Next.js example</h1>
      <p>Release: <code>{process.env.HAWK_RELEASE}</code></p>
      <ErrorButton />
      <ul>
        <li><Link href="/posts/hello">Dynamic route</Link></li>
        <li><Link href="/boundary">Error boundary</Link></li>
        <li><Link href="/server-error">Server error</Link></li>
        <li><Link href="/action-error">Server action error</Link></li>
        <li><a href="/edge-error">Edge runtime error</a></li>
        <li><a href="/edge-send">Send from the Edge runtime</a></li>
        <li><Link href="/redirect">Redirect (not sent)</Link></li>
        <li><Link href="/not-found-page">Not found (not sent)</Link></li>
      </ul>
    </main>
  );
}
