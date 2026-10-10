import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSessionDto } from '@insidelife/shared';
import { useSession } from '@/common/auth/session-store';
import { useToasts } from '@/common/components/toast-store';
import { ApiError } from '../api-error';
import { BUSY_MAX_RETRIES, busyDelayMs, isBusyAnswer, resetBusyNotice, retryAfterMs } from '../busy';
import { retrySnapshot } from '@/common/game/snapshot';
import { api } from '../http';
import { createQueryClient } from '../query-client';

const SESSION: AuthSessionDto = {
  accessToken: 'token',
  accessTokenExpiresAt: Date.now() + 900_000,
  user: { id: 'u1', email: 'ada@example.com', emailVerified: true, mustVerifyEmail: false, hasCharacter: true },
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const busy = (retryAfter = '3') => (): Response =>
  json(503, { errorCode: 'SERVER_BUSY', message: 'Lagos is busy right now. Try again in a moment.', timestamp: '', traceId: 't' }, { 'Retry-After': retryAfter });
const limited = (): Response => json(429, { errorCode: 'RATE_LIMITED', message: 'Slow down', timestamp: '', traceId: 't' });

/** Answer each call with the next response; the last one repeats. */
function respond(...responses: Array<() => Response>) {
  let call = 0;
  const fetchMock = vi.fn(async () => responses[Math.min(call++, responses.length - 1)]!());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('busy server: retries reads and idempotent commands', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetBusyNotice();
    useToasts.setState({ toasts: [] });
    useSession.getState().setSession(SESSION);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('waits at least Retry-After, tries again and resolves, with one friendly toast', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const fetchMock = respond(busy('3'), busy('3'), () => json(200, { ok: true }));
    const result = api.get<{ ok: boolean }>('/characters/me');
    await vi.advanceTimersByTimeAsync(2_999);
    expect(fetchMock).toHaveBeenCalledTimes(1); // honours Retry-After: 3 s
    const toasts = useToasts.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ title: 'Lagos is busy right now — retrying…', tone: 'neutral' });
    await vi.advanceTimersByTimeAsync(1); // the retry (no jitter here) gets the second busy answer: no second toast
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useToasts.getState().toasts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(result).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries 429 too, and idempotent commands: PUT, a heartbeat, a body with an idempotency key', async () => {
    respond(limited, () => json(200, { state: 'playing' }));
    const put = api.put('/characters/me/play-state', { state: 'playing' });
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(put).resolves.toEqual({ state: 'playing' });

    respond(busy('1'), () => json(200, { accepted: true }));
    const beat = api.post('/characters/me/heartbeats', { position: { x: 1, z: 2 }, mode: 'walk' }, { idempotent: true });
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(beat).resolves.toEqual({ accepted: true });

    respond(busy('1'), () => json(200, { bought: true }));
    const buy = api.post('/shop/purchases', { itemId: 'rice', idempotencyKey: 'k-1' });
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(buy).resolves.toEqual({ bought: true });
  });

  it('does not resend a plain command: the caller gets the friendly SERVER_BUSY error at once', async () => {
    const fetchMock = respond(busy());
    const start = api.post('/characters/me/actions', { actionId: 'scroll', durationMinutes: 15 });
    await expect(start).rejects.toMatchObject({ status: 503, code: 'SERVER_BUSY', isBusy: true, message: 'Lagos is busy right now. Try again in a moment.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after a few tries and hands back the busy error (the query layer may retry later)', async () => {
    const fetchMock = respond(busy('1'));
    const read = api.get('/visits');
    const settled = read.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const error = await settled;
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isBusy).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(BUSY_MAX_RETRIES + 1);
  });

  it('never retries an ordinary 5xx or 4xx, nor a keepalive last word', async () => {
    let fetchMock = respond(() => json(500, { errorCode: 'INTERNAL_ERROR', message: 'x', timestamp: '', traceId: 't' }));
    await expect(api.get('/visits')).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock = respond(() => json(422, { errorCode: 'BUSY', message: 'You’re busy (scrolling).', timestamp: '', traceId: 't' }));
    await expect(api.get('/visits')).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock = respond(busy());
    await expect(api.put('/characters/me/play-state', { state: 'away' }, { keepalive: true })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops waiting when the caller aborts', async () => {
    respond(busy('5'));
    const controller = new AbortController();
    const read = api.get('/characters/me', { signal: controller.signal });
    const settled = read.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    expect(((await settled) as Error).name).toBe('AbortError');
  });
});

describe('busy policy', () => {
  it('knows a busy answer when it sees one', () => {
    expect(isBusyAnswer(503, { errorCode: 'SERVER_BUSY' })).toBe(true);
    expect(isBusyAnswer(429, null)).toBe(true);
    expect(isBusyAnswer(503, { errorCode: 'INTERNAL_ERROR' })).toBe(false);
    expect(isBusyAnswer(503, null)).toBe(false); // a proxy's 503 page, not the shedder
    expect(isBusyAnswer(500, { errorCode: 'SERVER_BUSY' })).toBe(false);
  });

  it('reads Retry-After as seconds or a date', () => {
    expect(retryAfterMs('3')).toBe(3_000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 4_000)).toBe(6_000);
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs('soon')).toBeNull();
  });

  it('backs off exponentially with jitter, never sooner than asked, capped', () => {
    expect(busyDelayMs(0, null, () => 0)).toBe(1_000);
    expect(busyDelayMs(2, null, () => 0)).toBe(4_000);
    expect(busyDelayMs(0, 3_000, () => 0)).toBe(3_000);
    expect(busyDelayMs(0, 3_000, () => 0.999)).toBeLessThan(4_500);
    expect(busyDelayMs(10, null, () => 0)).toBe(15_000);
  });
});

describe('the query layer after a busy spell', () => {
  const error = (status: number, errorCode: string) => new ApiError(status, { errorCode, message: 'x', timestamp: '', traceId: 't' });

  it('keeps retrying the snapshot while the server is busy, so it refreshes again once there is room', () => {
    expect(retrySnapshot(3, error(503, 'SERVER_BUSY'))).toBe(true);
    expect(retrySnapshot(3, error(429, 'RATE_LIMITED'))).toBe(true);
    expect(retrySnapshot(3, error(502, 'BAD_GATEWAY'))).toBe(true);
    expect(retrySnapshot(3, error(404, 'NO_CHARACTER'))).toBe(false);
  });

  it('retries other queries on a busy answer too, but not on a definite 4xx', () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry as (failures: number, error: unknown) => boolean;
    expect(retry(0, error(429, 'RATE_LIMITED'))).toBe(true);
    expect(retry(0, error(503, 'SERVER_BUSY'))).toBe(true);
    expect(retry(0, error(403, 'FORBIDDEN'))).toBe(false);
  });
});
