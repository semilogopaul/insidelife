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

let refreshInFlight: Promise<boolean> | null = null;

/** Exchange the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${env.apiBase}/auth/refresh`, { method: 'POST', credentials: 'same-origin' });
      if (!response.ok) {
        useSession.getState().clear();
        return false;
      }
      useSession.getState().setSession((await response.json()) as AuthSessionDto);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshInFlight = null), 0);
    }
  })();
  return refreshInFlight;
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
