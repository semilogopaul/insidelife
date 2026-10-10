/**
 * Keeps an installed game on the latest build. The app shell is served from the service worker's saved copy (so it
 * opens instantly), which would otherwise run the previous build once after every deploy. On launch and whenever the
 * player comes back to the app, this asks `/version.json` for the server's build; if it's newer, it shows
 * "Updating Lagos…", drops the saved pages and reloads from the network. At most one reload per build (loop guard).
 */
const CURRENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
const PAGES_CACHE_PREFIX = 'inside-life-pages-';
const GUARD_KEY = 'insidelife:updated-to';
/** Coming back to the app checks again, but not more than once a minute. */
const RECHECK_MS = 60_000;

let lastCheck = 0;

/** A different, real build on the server (local dev builds never trigger a refresh). */
export function needsUpdate(current: string, latest: string | null): latest is string {
  return current !== 'dev' && latest !== null && latest !== 'dev' && latest !== current;
}

async function latestBuild(): Promise<string | null> {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const body = (await response.json()) as { buildId?: unknown };
    return typeof body.buildId === 'string' ? body.buildId : null;
  } catch {
    return null;
  }
}

function showUpdating(): void {
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.textContent = 'Updating Lagos…';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#0f2a33;color:#f2b705;font:700 1.25rem system-ui,sans-serif;';
  document.body.append(overlay);
}

async function dropSavedPages(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith(PAGES_CACHE_PREFIX)).map((name) => caches.delete(name)));
}

/** Check once (throttled unless `force`); refresh into the server's build when this copy is out of date. */
export async function checkForUpdate({ force = false, current = CURRENT_BUILD, now = Date.now() } = {}): Promise<boolean> {
  if (!force && now - lastCheck < RECHECK_MS) return false;
  lastCheck = now;
  const latest = await latestBuild();
  if (!needsUpdate(current, latest)) return false;
  try {
    if (window.sessionStorage.getItem(GUARD_KEY) === latest) return false;
    window.sessionStorage.setItem(GUARD_KEY, latest);
  } catch {
    // Storage blocked: still refresh once; the next launch compares again.
  }
  showUpdating();
  await dropSavedPages().catch(() => undefined);
  await navigator.serviceWorker
    ?.getRegistration()
    .then((registration) => registration?.update())
    .catch(() => undefined);
  window.location.reload();
  return true;
}

/** Launch check plus a check whenever the player returns to the app. */
export function watchForUpdates(): () => void {
  void checkForUpdate({ force: true });
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
}

const STALE_RELOAD_KEY = 'insidelife:stale-reload-at';
const STALE_PATTERN = /ChunkLoadError|Loading (CSS )?chunk|Failed to load chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/** A screen's code from an older build that this server no longer has (the saved copy is out of date). */
export function isStaleBuildError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return STALE_PATTERN.test(`${error.name} ${error.message}`);
}

/**
 * Refresh into the server's build after a stale-build error instead of showing an error screen. At most once a minute,
 * so a real outage still shows the normal "This page tripped" screen.
 */
export async function recoverFromStaleBuild(now: number = Date.now()): Promise<boolean> {
  try {
    const last = Number(window.sessionStorage.getItem(STALE_RELOAD_KEY));
    if (Number.isFinite(last) && now - last < RECHECK_MS) return false;
    window.sessionStorage.setItem(STALE_RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  showUpdating();
  await dropSavedPages().catch(() => undefined);
  window.location.reload();
  return true;
}
