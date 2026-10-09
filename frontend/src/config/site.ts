/**
 * Public site identity: the canonical origin (absolute OpenGraph/Twitter image URLs) and the public contact address.
 * Override the origin per environment with `NEXT_PUBLIC_SITE_URL` (e.g. a staging domain).
 */
export const site = {
  url: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://insidelife.online'),
  supportEmail: 'hello@insidelife.online',
  /** The company that runs Inside Life (legal pages, footer). */
  operator: 'iLaw Legaltech Solutions',
  /** First year of publication for the © line (a fixed year: pages are prerendered, and the first year is what counts). */
  copyrightYear: 2026,
} as const;

/**
 * The service worker (offline shell + asset cache, required for "Download the app") runs in production builds.
 * `NEXT_PUBLIC_SERVICE_WORKER=off` disables it (and unregisters it for returning players); `=on` opts in during
 * `next dev` to test the PWA, at the cost of cached dev chunks until you turn it off again.
 */
export const pwa = {
  serviceWorker:
    process.env.NODE_ENV === 'production' ? process.env.NEXT_PUBLIC_SERVICE_WORKER !== 'off' : process.env.NEXT_PUBLIC_SERVICE_WORKER === 'on',
} as const;
