'use client';

import { useEffect } from 'react';
import { Button, Wordmark } from '@/common/components';

export default function RouteError({ error, reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="safe-pad grid min-h-dvh place-items-center bg-ink text-on-ink">
      <div className="max-w-sm text-center">
        <Wordmark className="mx-auto mb-8" />
        <h1 className="type-title text-3xl">This page tripped</h1>
        <p className="mt-2 text-on-ink-soft">Your game progress is safe on the server. Reload this screen to carry on.</p>
        <Button className="mt-6" onClick={reset}>
          Reload screen
        </Button>
      </div>
    </main>
  );
}
