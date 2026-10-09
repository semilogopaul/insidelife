import { pwa } from '@/config/site';

/** Lives in `public/`, so its scope is the whole site without a `Service-Worker-Allowed` header. */
export const SERVICE_WORKER_URL = '/sw.js';
/** Cache-name prefix used by `public/sw.js`. */
const CACHE_PREFIX = 'inside-life-';

/**
 * Registers the service worker once the page has loaded (so it never competes with the first paint for bandwidth).
 * When the worker is switched off, removes any worker and caches a previous build left behind.
 */
export function setUpServiceWorker(enabled: boolean = pwa.serviceWorker): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!enabled) {
    void removeServiceWorker();
    return;
  }
  const register = (): void => {
    navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Private mode, blocked storage or an insecure origin: the game simply runs without offline support.
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

async function removeServiceWorker(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const ours = registrations.filter((registration) =>
    (registration.active ?? registration.waiting ?? registration.installing)?.scriptURL.endsWith(SERVICE_WORKER_URL),
  );
  await Promise.all(ours.map((registration) => registration.unregister()));
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)));
}
