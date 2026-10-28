'use client';

import { HawkErrorBoundary } from '@hawk.so/nextjs';
import { useState } from 'react';

/**
 * Throws during rendering, so the error is caught by the boundary
 */
function Broken(): never {
  throw new Error('Hawk Next.js example render error');
}

export default function Boundary() {
  const [isBroken, setBroken] = useState(false);

  return (
    <main>
      <h1>Error boundary</h1>
      <HawkErrorBoundary fallback={({ reset }) => <button type="button" onClick={reset}>Render again</button>}>
        {isBroken ? <Broken /> : <button type="button" onClick={() => setBroken(true)}>Break the component</button>}
      </HawkErrorBoundary>
    </main>
  );
}
