'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { AppMark, Button } from '@/common/components';

const PROBE_EVERY_MS = 5_000;

/** True once the server answers. HEAD requests skip the service worker, so this really goes to the network. */
async function serverReachable(): Promise<boolean> {
  try {
    return (await fetch('/icon.svg', { method: 'HEAD', cache: 'no-store' })).ok;
  } catch {
    return false;
  }
}

/** What the service worker shows when a page can't reach the network. Retries by itself when the connection returns. */
export function OfflineScreen() {
  const router = useRouter();
  // The worker serves this screen under the URL the player asked for, so reloading retries that page.
  const retry = useCallback(() => {
    if (window.location.pathname === '/offline') router.replace('/');
    else window.location.reload();
  }, [router]);

  // `online` can fire a moment before the network (and the service worker) is usable, and flaky Wi-Fi never fires it,
  // so confirm the server answers before reloading and keep checking while the browser believes it is online.
  useEffect(() => {
    let timer: number | undefined;
    let active = true;
    const check = async (): Promise<void> => {
      if (await serverReachable()) {
        if (active) retry();
      } else if (active && navigator.onLine) {
        timer = window.setTimeout(() => void check(), PROBE_EVERY_MS);
      }
    };
    const onOnline = (): void => {
      window.clearTimeout(timer);
      void check();
    };
    window.addEventListener('online', onOnline);
    if (navigator.onLine) timer = window.setTimeout(() => void check(), PROBE_EVERY_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [retry]);

  return (
    <main className="safe-pad grid min-h-dvh place-items-center bg-ink px-6 text-on-ink">
      <div className="flex max-w-sm flex-col items-center text-center">
        <AppMark size={96} className="mb-8" />
        <h1 className="type-title text-3xl">Network don cut</h1>
        <p className="mt-2 text-on-ink-soft">
          Inside Life plays live on our servers, so it needs a connection. Check your data or Wi-Fi. Your life is saved
          exactly where you left it.
        </p>
        <Button className="mt-6" onClick={retry}>
          Try again
        </Button>
        <p role="status" className="mt-4 text-sm text-on-ink-soft">
          We’ll reload by ourselves once you’re back online.
        </p>
      </div>
    </main>
  );
}
