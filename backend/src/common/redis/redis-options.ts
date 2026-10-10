import type { RedisOptions } from 'ioredis';

/**
 * Keep idle connections alive: managed Redis services (Azure Managed Redis, ...) drop connections that sit idle for
 * a few minutes, and the blocking connections BullMQ and the Socket.IO subscriber hold are often quiet.
 */
export const REDIS_KEEP_ALIVE_MS = 30_000;

/**
 * ioredis options built from a `redis://` / `rediss://` URL, for libraries that take an options object instead of a
 * URL string (BullMQ passes `connection` straight to `new IORedis(options)`, which has no `url` option and would
 * otherwise silently fall back to localhost:6379). `rediss://` turns TLS on with the system's trusted CAs and the host
 * as SNI name. Non-clustered servers only.
 */
export function redisOptionsFromUrl(url: string, overrides: RedisOptions = {}): RedisOptions {
  const parsed = new URL(url);
  const secure = parsed.protocol === 'rediss:';
  const db = parsed.pathname.length > 1 ? Number.parseInt(parsed.pathname.slice(1), 10) : 0;
  return {
    host: parsed.hostname.replace(/^\[|\]$/g, ''),
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(Number.isInteger(db) && db > 0 ? { db } : {}),
    ...(secure ? { tls: { servername: parsed.hostname } } : {}),
    keepAlive: REDIS_KEEP_ALIVE_MS,
    ...overrides,
  };
}
