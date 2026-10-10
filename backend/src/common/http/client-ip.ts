import { isIP } from 'node:net';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * The client IP from a header the edge sets (`CLIENT_IP_HEADER`, e.g. `cf-connecting-ip` behind Cloudflare).
 *
 * Express' `trust proxy` counts hops, which breaks when the number of proxies between the browser and the API is not
 * fixed (Cloudflare -> ingress -> gateway). With the header configured, `req.ip` becomes that value, so everything
 * that reads it (HTTP throttling, auth attempt limits, the audit log, request logs) sees the real address. A missing
 * or malformed header falls back to Express' own `req.ip`.
 *
 * Only configure this when every request reaches the API through a proxy that overwrites the header; otherwise a
 * client could set it and pick its own IP.
 */
export function clientIpFromHeader(request: Pick<Request, 'headers'>, header: string): string | null {
  const raw = request.headers[header.toLowerCase()];
  const first = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim();
  if (!first) return null;
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) is the same client as 1.2.3.4.
  const candidate = first.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, '$1');
  return isIP(candidate) === 0 ? null : candidate;
}

export function clientIpMiddleware(header: string): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const ip = clientIpFromHeader(request, header);
    if (ip) Object.defineProperty(request, 'ip', { value: ip, configurable: true, enumerable: true, writable: true });
    next();
  };
}
