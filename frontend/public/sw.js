/*
 * Inside Life service worker: hand-written, no dependencies. Registered by `src/common/pwa/service-worker.ts`.
 *
 * - Hashed Next.js build files (`/_next/static/`: JS, CSS, fonts), game assets (`/assets/`: GLB, textures, audio) and
 *   icons: cache-first. Their URLs change when their content does (`/assets/` is served `immutable` already).
 * - App shell pages (landing, play, create, sign-in/up): stale-while-revalidate, so an installed game opens instantly
 *   and picks up a new deploy on the next launch.
 * - Every other page: network first. Any navigation that can't reach the network gets the `/offline` page.
 * - Never touched: `/api/`, `/socket.io/`, `/media/`, non-GET requests, ranged media requests, other origins and Next
 *   flight data (RSC) requests. The game is server-authoritative; nothing it says is ever served from a cache.
 *
 * Bump VERSION when these rules change (or to evict every cache); `activate` deletes caches from older versions.
 * Updates install in the background and take over once every Inside Life tab or window has closed.
 */
const VERSION = 'v1';
const PREFIX = 'inside-life-';
const CACHE = {
  static: `${PREFIX}static-${VERSION}`,
  assets: `${PREFIX}assets-${VERSION}`,
  pages: `${PREFIX}pages-${VERSION}`,
};
/** Old hashed chunks pile up across deploys; keep the newest. */
const LIMITS = { [CACHE.static]: 400, [CACHE.assets]: 250 };

const OFFLINE_URL = '/offline';
const SHELL_ROUTES = new Set(['/', '/play', '/create', '/sign-in', '/sign-up', '/offline']);
const NEVER_CACHE = ['/api/', '/socket.io/', '/media/'];
const ICON = /^\/(?:icons\/[\w.-]+\.png|icon\.svg|favicon\.ico)$/;
const STATIC_IN_HTML = /\/_next\/static\/[^"'\\\s<>)]+/g;

self.addEventListener('install', (event) => {
  event.waitUntil(precacheOfflinePage());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const current = new Set(Object.values(CACHE));
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith(PREFIX) && !current.has(name)).map((name) => caches.delete(name)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((prefix) => url.pathname.startsWith(prefix))) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(event, url));
  } else if (url.pathname.startsWith('/_next/static/') || ICON.test(url.pathname)) {
    event.respondWith(cacheFirst(event, CACHE.static));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(event, CACHE.assets));
  } else if (url.pathname === '/manifest.webmanifest') {
    event.respondWith(staleWhileRevalidate(event, url.pathname));
  }
  // Anything else (RSC/prefetch requests, /health, …) goes straight to the network.
});

/** The offline page plus the CSS, JS and fonts it references, so it renders (and hydrates) without a network. */
async function precacheOfflinePage() {
  const response = await fetch(OFFLINE_URL, { cache: 'reload' });
  if (!response.ok) throw new Error(`offline page: HTTP ${response.status}`);
  const html = await response.clone().text();
  await (await caches.open(CACHE.pages)).put(OFFLINE_URL, response);
  const files = new Set(Array.from(html.matchAll(STATIC_IN_HTML), (match) => match[0].replaceAll('&amp;', '&')));
  const cache = await caches.open(CACHE.static);
  await Promise.all([...files, '/icon.svg'].map((file) => cache.add(file).catch(() => undefined)));
}

function isCacheable(response) {
  return response.ok && response.type === 'basic' && !response.redirected;
}

/** Network response for a navigation, reusing the navigation preload request when the browser started one. */
async function fromNetwork(event) {
  const preloaded = await event.preloadResponse;
  return preloaded || fetch(event.request);
}

async function navigate(event, url) {
  // Known to be offline: answer at once instead of waiting for the request to fail.
  if (self.navigator.onLine === false) {
    event.waitUntil(Promise.resolve(event.preloadResponse).catch(() => undefined));
    return offlinePage();
  }
  if (!SHELL_ROUTES.has(url.pathname)) {
    try {
      return await fromNetwork(event);
    } catch {
      return offlinePage();
    }
  }

  // App shell: serve the cached page now, refresh it in the background. Keyed by path (the shells are static and read
  // their query string on the client).
  const cache = await caches.open(CACHE.pages);
  const cached = await cache.match(url.pathname);
  const refresh = fromNetwork(event).then(async (response) => {
    if (isCacheable(response) && (response.headers.get('content-type') || '').includes('text/html')) {
      await cache.put(url.pathname, response.clone());
    }
    return response;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  try {
    return await refresh;
  } catch {
    return offlinePage();
  }
}

async function cacheFirst(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (isCacheable(response)) {
    const copy = response.clone();
    event.waitUntil(cache.put(event.request, copy).then(() => trim(cache, LIMITS[cacheName])));
  }
  return response;
}

async function staleWhileRevalidate(event, key) {
  const cache = await caches.open(CACHE.pages);
  const cached = await cache.match(key);
  const refresh = fetch(event.request).then(async (response) => {
    if (isCacheable(response)) await cache.put(key, response.clone());
    return response;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  return refresh;
}

/** Deletes the oldest entries (Cache API keys come back in insertion order) above `limit`. */
async function trim(cache, limit) {
  if (!limit) return;
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key)));
}

async function offlinePage() {
  const cached = await caches.match(OFFLINE_URL, { cacheName: CACHE.pages });
  if (cached) return cached;
  return new Response(
    '<!doctype html><html lang="en-NG"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Offline · Inside Life</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0e2733;color:#f4f7f5;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px">' +
      '<main><h1 style="color:#f6b90b">Network don cut</h1><p>Inside Life needs a connection. Check your data or Wi-Fi, then reload.</p></main>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
