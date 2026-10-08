import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const TRACE_HEADER = 'x-trace-id';

/** Reuse an inbound trace id (from the reverse proxy) when it is a sane token, otherwise mint one. */
export function resolveTraceId(request: IncomingMessage): string {
  const inbound = request.headers[TRACE_HEADER] ?? request.headers['x-request-id'];
  const value = Array.isArray(inbound) ? inbound[0] : inbound;
  return value && /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : randomUUID();
}

/** pino-http stores the request id on `req.id`. */
export function traceIdOf(request: { id?: unknown }): string {
  return typeof request.id === 'string' ? request.id : String(request.id ?? 'unknown');
}
