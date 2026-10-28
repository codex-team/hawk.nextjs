import { ErrorButton } from '../../error-button';

/**
 * Dynamic route: Next.js encodes `[slug]` in URLs of its chunks, e.g. `/_next/static/chunks/app/posts/%5Bslug%5D/page-1f2e.js`
 */
export function generateStaticParams(): { slug: string }[] {
  return [{ slug: 'hello' }];
}

export default async function Post({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <main>
      <h1>Post: {slug}</h1>
      <ErrorButton />
    </main>
  );
}
