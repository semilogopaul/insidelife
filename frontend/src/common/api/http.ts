import type { AuthSessionDto } from '@insidelife/shared';
import { env } from '@/config/env';
import { useSession } from '@/common/auth/session-store';
import { ApiError } from './api-error';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly signal?: AbortSignal;
  /** Skip auth header and refresh (login/register/refresh themselves). */
  readonly anonymous?: boolean;
}

/**
 * How a refresh ended. Only `signed-out` (the server rejected the refresh cookie) ends the session; `unreachable`
 * (offline, the API restarting, a proxy error page, rate limited) keeps it exactly as it was, to be retried.
 */
export type RefreshOutcome = 'refreshed' | 'signed-out' | 'unreachable';

/** Error codes that mean the refresh cookie itself is no good (missing, expired, revoked). */
const AUTH_REJECTION_CODES: ReadonlySet<string> = new Set(['UNAUTHENTICATED', 'INVALID_CREDENTIALS']);
/** Shared by every tab of this site, so two tabs never rotate the same refresh cookie at once. */
const REFRESH_LOCK = 'insidelife:auth-refresh';
const REFRESH_TIMEOUT_MS = 15_000;

/** True only for a definitive "sign in again" answer from the API, never for 5xx, 429 or network trouble. */
export function isAuthRejection(status: number, body: unknown): boolean {
  if (status === 401) return true;
  const code = typeof body === 'object' && body !== null && 'errorCode' in body ? String(body.errorCode) : '';
  return status >= 400 && status < 500 && AUTH_REJECTION_CODES.has(code);
}

async function attemptRefresh(): Promise<RefreshOutcome> {
  const session = useSession.getState();
  try {
    const response = await fetch(`${env.apiBase}/auth/refresh`, {
      method: 'POST',
      credentials: 'same-origin',
      // Older Safari (iOS 15) has no AbortSignal.timeout: then the browser's own timeout applies.
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(REFRESH_TIMEOUT_MS) : undefined,
    });
    if (response.ok) {
      session.setSession((await response.json()) as AuthSessionDto);
      return 'refreshed';
    }
    if (isAuthRejection(response.status, await response.json().catch(() => null))) {
      session.clear();
      return 'signed-out';
    }
  } catch {
    // Offline, timed out, or an unreadable body: same as a 5xx below.
  }
  session.markUnreachable();
  return 'unreachable';
}

/** Run `task` while holding the cross-tab refresh lock (Web Locks), or directly where the browser has none. */
function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request(REFRESH_LOCK, task) : task();
}

let refreshInFlight: Promise<RefreshOutcome> | null = null;

/** Exchange the refresh cookie for a new access token. Concurrent callers in this tab share one request. */
export function refreshSessionOutcome(): Promise<RefreshOutcome> {
  refreshInFlight ??= withRefreshLock(attemptRefresh)
    .catch((): RefreshOutcome => 'unreachable')
    .finally(() => setTimeout(() => (refreshInFlight = null), 0));
  return refreshInFlight;
}

/** `refreshSessionOutcome`, as "do I have a fresh token now?". */
export async function refreshSession(): Promise<boolean> {
  return (await refreshSessionOutcome()) === 'refreshed';
}

/** The access token, refreshed first when it's about to expire (the realtime handshake can't refresh by itself). */
export async function freshAccessToken(): Promise<string | null> {
  const session = useSession.getState();
  if (session.status === 'authenticated' && session.expiresAt - Date.now() < 30_000) await refreshSession();
  return useSession.getState().accessToken;
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const url = `${env.apiBase}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function send(method: Method, path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const token = useSession.getState().accessToken;
  if (!options.anonymous && token) headers.Authorization = `Bearer ${token}`;
  return fetch(buildUrl(path, options.query), {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'same-origin',
    signal: options.signal,
  });
}

/**
 * Typed JSON request against the game API. Refreshes the access token once on 401 (or ahead of expiry) and retries.
 */
export async function request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
  const session = useSession.getState();
  if (!options.anonymous && session.accessToken && session.expiresAt - Date.now() < 30_000) await refreshSession();

  let response: Response;
  try {
    response = await send(method, path, options);
    if (response.status === 401 && !options.anonymous && (await refreshSession())) {
      response = await send(method, path, options);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, null);
  }

  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, payload as ConstructorParameters<typeof ApiError>[1]);
  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};
