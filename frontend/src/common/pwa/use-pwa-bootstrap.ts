'use client';

import { useEffect } from 'react';
// Imported for its side effect: starts capturing `beforeinstallprompt` as soon as the root bundle runs.
import './install-store';
import { setUpServiceWorker } from './service-worker';

/** Root-level PWA wiring (mounted once by the app providers): service worker registration and install capture. */
export function usePwaBootstrap(): void {
  useEffect(() => {
    setUpServiceWorker();
  }, []);
}
