'use client';

import { useEffect } from 'react';
// Imported for its side effect: starts capturing `beforeinstallprompt` as soon as the root bundle runs.
import './install-store';
import { setUpServiceWorker } from './service-worker';
import { watchForUpdates } from './update-check';

/** Root-level PWA wiring (mounted once by the app providers): service worker registration, install capture and the
 * refresh-to-latest check. */
export function usePwaBootstrap(): void {
  useEffect(() => {
    setUpServiceWorker();
    return watchForUpdates();
  }, []);
}
