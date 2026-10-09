import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSessionDto } from '@insidelife/shared';
import { useSession } from '@/common/auth/session-store';
import { restoreRetryDelay } from '@/common/auth/use-session-bootstrap';
import { ApiError } from '../api-error';
import { api, isAuthRejection, refreshSession, refreshSessionOutcome } from '../http';

const SESSION: AuthSessionDto = {
  accessToken: 'fresh',
  accessTokenExpiresAt: Date.now() + 900_000,
  user: {
    id: 'u1',
    email: 'ada@example.com',
    emailVerified: false,
    mustVerifyEmail: false,
    hasCharacter: true,
  },
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const errorBody = (errorCode: string) => ({ errorCode, message: 'x', timestamp: '', traceId: 't' });

/** Let the shared in-flight refresh settle so each test starts a new one. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function signedIn(): void {
  useSession.getState().setSession({ ...SESSION, accessToken: 'old' });
}

describe('session refresh', () => {
  beforeEach(() => {
    useSession.setState({
      status: 'unknown',
      accessToken: null,
      expiresAt: 0,
      user: null,
      unreachable: false,
    });
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await settle();
  });

  it('keeps a signed-in player signed in when the API is restarting (5xx)', async () => {
    signedIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Bad Gateway', { status: 502 })),
    );
    expect(await refreshSessionOutcome()).toBe('unreachable');
    expect(useSession.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'old',
      unreachable: true,
    });
  });

  it('keeps the session when the network is down or the refresh is rate limited', async () => {
    signedIn();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')));
    expect(await refreshSession()).toBe(false);
    await settle();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(429, errorBody('RATE_LIMITED'))),
    );
    expect(await refreshSessionOutcome()).toBe('unreachable');
    expect(useSession.getState().status).toBe('authenticated');
  });

  it('leaves a first load "unknown" (not signed out) while the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(503, errorBody('INTERNAL_ERROR'))),
    );
    expect(await refreshSessionOutcome()).toBe('unreachable');
    expect(useSession.getState()).toMatchObject({ status: 'unknown', unreachable: true });
  });

  it('signs out only when the server rejects the refresh cookie', async () => {
    signedIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(401, errorBody('UNAUTHENTICATED'))),
    );
    expect(await refreshSessionOutcome()).toBe('signed-out');
    expect(useSession.getState()).toMatchObject({ status: 'anonymous', accessToken: null });
  });

  it('stores the new session and clears the retrying flag', async () => {
    useSession.getState().markUnreachable();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, SESSION)),
    );
    expect(await refreshSessionOutcome()).toBe('refreshed');
    expect(useSession.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'fresh',
      unreachable: false,
    });
  });

  it('shares one request between concurrent callers', async () => {
    const fetchMock = vi.fn(async () => json(200, SESSION));
    vi.stubGlobal('fetch', fetchMock);
    const results = await Promise.all([refreshSession(), refreshSession(), refreshSessionOutcome()]);
    expect(results).toEqual([true, true, 'refreshed']);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('a 401 on a request whose refresh then fails to reach the API does not sign the player out', async () => {
    signedIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/auth/refresh')
          ? new Response('', { status: 503 })
          : json(401, errorBody('UNAUTHENTICATED')),
      ),
    );
    await expect(api.get('/characters/me')).rejects.toBeInstanceOf(ApiError);
    expect(useSession.getState().status).toBe('authenticated');
  });
});

describe('isAuthRejection', () => {
  it('is true only for definitive auth answers', () => {
    expect(isAuthRejection(401, null)).toBe(true);
    expect(isAuthRejection(403, errorBody('UNAUTHENTICATED'))).toBe(true);
    expect(isAuthRejection(500, errorBody('UNAUTHENTICATED'))).toBe(false);
    expect(isAuthRejection(502, null)).toBe(false);
    expect(isAuthRejection(429, errorBody('RATE_LIMITED'))).toBe(false);
    expect(isAuthRejection(403, errorBody('EMAIL_UNVERIFIED'))).toBe(false);
  });
});

describe('restoreRetryDelay', () => {
  it('backs off from 1 s to a 30 s ceiling', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(restoreRetryDelay)).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000,
    ]);
  });
});
