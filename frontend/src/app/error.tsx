'use client';

import { useEffect } from 'react';
import { Button, Wordmark } from '@/common/components';
import { isStaleBuildError, recoverFromStaleBuild } from '@/common/pwa';

export default function RouteError({ error, reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  const stale = isStaleBuildError(error);
  useEffect(() => {
    // Code from an older build after an update: refresh into the new one instead of stopping here.
    if (stale) void recoverFromStaleBuild();
    else console.error(error);
  }, [error, stale]);
  return (
    <main className="safe-pad grid min-h-dvh place-items-center bg-ink text-on-ink">
      <div className="max-w-sm text-center">
        <Wordmark className="mx-auto mb-8" />
        <h1 className="type-title text-3xl">This page tripped</h1>
        <p className="mt-2 text-on-ink-soft">Your game progress is safe on the server. Reload this screen to carry on.</p>
        <Button className="mt-6" onClick={() => (stale ? window.location.reload() : reset())}>
          Reload screen
        </Button>
      </div>
    </main>
  );
}
