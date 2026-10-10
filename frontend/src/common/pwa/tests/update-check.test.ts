import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdate, needsUpdate } from '../update-check';

const reload = vi.fn();

function serverBuild(buildId: string): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ buildId }), { status: 200 })));
}

describe('refresh to the latest build', () => {
  beforeEach(() => {
    reload.mockReset();
    window.sessionStorage.clear();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
    vi.stubGlobal('caches', { keys: vi.fn(async () => ['inside-life-pages-v1', 'inside-life-static-v1']), delete: vi.fn(async () => true) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('only a different, real build needs a refresh', () => {
    expect(needsUpdate('abc1234', 'def5678')).toBe(true);
    expect(needsUpdate('abc1234', 'abc1234')).toBe(false);
    expect(needsUpdate('dev', 'def5678')).toBe(false);
    expect(needsUpdate('abc1234', 'dev')).toBe(false);
    expect(needsUpdate('abc1234', null)).toBe(false);
  });

  it('shows "Updating Lagos…", drops only the saved pages and reloads once', async () => {
    serverBuild('def5678');
    expect(await checkForUpdate({ force: true, current: 'abc1234' })).toBe(true);
    expect(document.body.textContent).toContain('Updating Lagos…');
    expect(vi.mocked(caches.delete)).toHaveBeenCalledWith('inside-life-pages-v1');
    expect(vi.mocked(caches.delete)).not.toHaveBeenCalledWith('inside-life-static-v1');
    expect(reload).toHaveBeenCalledTimes(1);
    // Still the old copy after the reload (e.g. a slow edge): no reload loop.
    expect(await checkForUpdate({ force: true, current: 'abc1234' })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when already on the server build or offline', async () => {
    serverBuild('abc1234');
    expect(await checkForUpdate({ force: true, current: 'abc1234' })).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    expect(await checkForUpdate({ force: true, current: 'abc1234' })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('checks again on return at most once a minute', async () => {
    serverBuild('abc1234');
    await checkForUpdate({ force: true, current: 'abc1234', now: 1_000_000 });
    await checkForUpdate({ current: 'abc1234', now: 1_030_000 });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    await checkForUpdate({ current: 'abc1234', now: 1_070_000 });
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });
});
