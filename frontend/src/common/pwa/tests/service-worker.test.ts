import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

/**
 * Runs `public/sw.js` against an in-memory Cache Storage and a fake network, then drives its install, activate and
 * fetch handlers the way a browser would.
 */
const SOURCE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../public/sw.js'), 'utf8');
const ORIGIN = 'https://insidelife.test';

interface FakeResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly type: 'basic';
  readonly redirected: false;
  readonly headers: Headers;
  readonly body: string;
  clone(): FakeResponse;
  text(): Promise<string>;
}

function response(body: string, contentType = 'text/html', status = 200): FakeResponse {
  const res: FakeResponse = {
    ok: status < 400,
    status,
    type: 'basic',
    redirected: false,
    headers: new Headers({ 'content-type': contentType }),
    body,
    clone: () => response(body, contentType, status),
    text: () => Promise.resolve(body),
  };
  return res;
}

interface FakeRequest {
  readonly url: string;
  readonly method: string;
  readonly mode: string;
  readonly headers: Headers;
}

type Key = string | FakeRequest;
const href = (key: Key): string => new URL(typeof key === 'string' ? key : key.url, ORIGIN).href;

function loadWorker({ online = true, offlineHtml = '<link href="/_next/static/css/app.css"><script src="/_next/static/chunks/main.js"></script>' } = {}) {
  const stores = new Map<string, Map<string, FakeResponse>>();
  const network = vi.fn(async (input: Key): Promise<FakeResponse> => {
    const url = href(input);
    if (!online) throw new TypeError('Failed to fetch');
    if (url.endsWith('/offline')) return response(offlineHtml);
    return response(`network ${new URL(url).pathname}`, url.includes('/_next/') ? 'text/javascript' : 'text/html');
  });
  const cacheFor = (name: string) => {
    const entries = stores.get(name) ?? new Map<string, FakeResponse>();
    stores.set(name, entries);
    return {
      match: async (key: Key) => entries.get(href(key)),
      put: async (key: Key, value: FakeResponse) => void entries.set(href(key), value),
      add: async (key: Key) => void entries.set(href(key), await network(key)),
      keys: async () => [...entries.keys()].map((url) => ({ url })),
      delete: async (key: Key) => entries.delete(href(key)),
    };
  };
  const caches = {
    open: async (name: string) => cacheFor(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (key: Key, options: { cacheName: string }) => stores.get(options.cacheName)?.get(href(key)),
  };
  const listeners = new Map<string, (event: unknown) => void>();
  const self = {
    location: new URL('/sw.js', ORIGIN),
    navigator: { onLine: online },
    registration: { navigationPreload: null },
    clients: { claim: async () => undefined },
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
  };
  new Function('self', 'caches', 'fetch', 'Response', SOURCE)(self, caches, network, Response);

  const extendable = () => {
    const pending: Promise<unknown>[] = [];
    return { pending, waitUntil: (promise: Promise<unknown>) => void pending.push(promise) };
  };
  const lifecycle = async (type: 'install' | 'activate') => {
    const event = extendable();
    listeners.get(type)?.(event);
    await Promise.all(event.pending);
  };
  /** Dispatches a fetch; resolves to what the worker answered, or null when it let the request through. */
  const request = async (path: string, init: { method?: string; mode?: string; headers?: Record<string, string> } = {}) => {
    const event = {
      ...extendable(),
      request: { url: new URL(path, ORIGIN).href, method: init.method ?? 'GET', mode: init.mode ?? 'cors', headers: new Headers(init.headers) },
      preloadResponse: Promise.resolve(undefined),
      answer: null as Promise<FakeResponse> | null,
      respondWith(answer: Promise<FakeResponse>) {
        this.answer = answer;
      },
    };
    listeners.get('fetch')?.(event);
    const answer = event.answer ? await event.answer : null;
    await Promise.all(event.pending);
    return answer;
  };
  return { stores, network, lifecycle, request, navigate: (path: string) => request(path, { mode: 'navigate' }), self };
}

describe('service worker', () => {
  it('never handles API, realtime, media, non-GET, ranged, cross-origin or RSC requests', async () => {
    const sw = loadWorker();
    await expect(sw.request('/api/v1/snapshot')).resolves.toBeNull();
    await expect(sw.navigate('/api/v1/payments/callback')).resolves.toBeNull();
    await expect(sw.request('/socket.io/?EIO=4&transport=polling')).resolves.toBeNull();
    await expect(sw.request('/media/billboards/a.png')).resolves.toBeNull();
    await expect(sw.request('/_next/static/chunks/a.js', { method: 'POST' })).resolves.toBeNull();
    await expect(sw.request('/assets/audio/horn.mp3', { headers: { range: 'bytes=0-' } })).resolves.toBeNull();
    await expect(sw.request('https://fonts.example.com/a.woff2')).resolves.toBeNull();
    await expect(sw.request('/play?_rsc=1x2', { headers: { RSC: '1' } })).resolves.toBeNull();
    expect(sw.stores.size).toBe(0);
  });

  it('serves hashed build files, game assets and icons cache-first', async () => {
    const sw = loadWorker();
    for (const path of ['/_next/static/chunks/a.js', '/assets/city/commercial.glb', '/icons/icon-192.png']) {
      await expect(sw.request(path)).resolves.toMatchObject({ body: `network ${path}` });
      await expect(sw.request(path)).resolves.toMatchObject({ body: `network ${path}` });
    }
    expect(sw.network).toHaveBeenCalledTimes(3);
    expect([...sw.stores.keys()].sort()).toEqual(['inside-life-assets-v1', 'inside-life-static-v1']);
  });

  it('serves app shell pages stale-while-revalidate', async () => {
    const sw = loadWorker();
    await sw.navigate('/play');
    sw.stores.get('inside-life-pages-v1')!.set(`${ORIGIN}/play`, response('cached play'));
    await expect(sw.navigate('/play?from=pwa')).resolves.toMatchObject({ body: 'cached play' });
    expect(sw.network).toHaveBeenCalledTimes(2);
    expect(sw.stores.get('inside-life-pages-v1')!.get(`${ORIGIN}/play`)).toMatchObject({ body: 'network /play' });
  });

  it('precaches the offline page and its assets, and serves it when the network is gone', async () => {
    const sw = loadWorker();
    await sw.lifecycle('install');
    expect([...sw.stores.get('inside-life-static-v1')!.keys()]).toEqual(
      expect.arrayContaining([`${ORIGIN}/_next/static/css/app.css`, `${ORIGIN}/_next/static/chunks/main.js`, `${ORIGIN}/icon.svg`]),
    );
    sw.network.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(sw.navigate('/payments/callback')).resolves.toMatchObject({ body: expect.stringContaining('/_next/static/') });
    await expect(sw.navigate('/sign-in')).resolves.toMatchObject({ body: expect.stringContaining('/_next/static/') });
  });

  it('answers navigations with the offline page at once when the browser reports offline', async () => {
    const online = loadWorker();
    await online.lifecycle('install');
    const sw = loadWorker({ online: false });
    sw.stores.set('inside-life-pages-v1', online.stores.get('inside-life-pages-v1')!);
    await expect(sw.navigate('/play')).resolves.toMatchObject({ body: expect.stringContaining('/_next/static/') });
    expect(sw.network).not.toHaveBeenCalled();
  });

  it('falls back to a built-in page when even the offline page is missing', async () => {
    const sw = loadWorker({ online: false });
    const answer = (await sw.navigate('/play')) as unknown as Response;
    expect(answer.status).toBe(503);
    await expect(answer.text()).resolves.toContain('needs a connection');
  });

  it('deletes caches from older versions on activate and keeps unrelated caches', async () => {
    const sw = loadWorker();
    sw.stores.set('inside-life-static-v0', new Map());
    sw.stores.set('inside-life-pages-v1', new Map());
    sw.stores.set('another-app', new Map());
    await sw.lifecycle('activate');
    expect([...sw.stores.keys()].sort()).toEqual(['another-app', 'inside-life-pages-v1']);
  });
});
