/**
 * Public, environment-based configuration. Secrets never live here — the browser only knows where to connect.
 */
export const env = {
  /** REST API base (same origin; Next/nginx proxy `/api`). */
  apiBase: '/api/v1',
  /** Realtime socket origin; empty string means same origin. */
  realtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL ?? '',
} as const;
