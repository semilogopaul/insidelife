import type { INestApplication } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';
import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorBody } from '@insidelife/shared';
import { resolveTraceId } from '../utils/trace.js';

/** `/api/v1/admin` and everything under it (any API version). */
const ADMIN_PATH = /^\/api\/v\d+\/admin(?:\/|$)/;

/** Methods a browser sends without an Origin header and that change nothing. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isAdminPath(path: string): boolean {
  return ADMIN_PATH.test(path.split('?')[0] ?? '');
}

/** Who may call what from a browser, and where the admin API is served. */
export interface HttpBoundaryPolicy {
  /** The game's origins (CORS_ORIGINS): every route except the admin API. */
  readonly gameOrigins: readonly string[];
  /** The admin portal's origins (ADMIN_ORIGINS): the admin API only. */
  readonly adminOrigins: readonly string[];
  /** Refuse a state-changing admin request that has no Origin header (production; browsers always send one). */
  readonly requireAdminOrigin: boolean;
  /** When set (ADMIN_API_HOST), the admin API answers only on this host, e.g. `admin-api.insidelife.online`. */
  readonly adminApiHost: string | null;
}

export interface RequestFacts {
  readonly method: string;
  readonly path: string;
  readonly origin: string | undefined;
  readonly host: string | undefined;
}

export interface AdminRefusal {
  readonly status: 403 | 404;
  readonly errorCode: string;
  readonly message: string;
}

const hostnameOf = (host: string | undefined): string => (host ?? '').trim().toLowerCase().replace(/:\d+$/, '');
const originOf = (origin: string): string => origin.trim().replace(/\/+$/, '');

/**
 * Why an admin API request must be refused before it reaches a controller (null = let it through).
 *
 * The game and the API share a site, so a script running on the game's origin (an XSS) could otherwise POST to the
 * admin API, including `auth/refresh` with the admin's refresh cookie. Browsers send `Origin` on every non-GET request,
 * same-origin ones included, so requiring it to be one of ADMIN_ORIGINS shuts that out. Reads (GET) need an admin
 * access token, which only the portal holds.
 */
export function adminRequestRefusal(request: RequestFacts, policy: HttpBoundaryPolicy): AdminRefusal | null {
  if (!isAdminPath(request.path)) return null;
  if (policy.adminApiHost && hostnameOf(request.host) !== policy.adminApiHost.toLowerCase()) {
    return { status: 404, errorCode: 'RESOURCE_NOT_FOUND', message: 'Not found' };
  }
  if (SAFE_METHODS.has(request.method.toUpperCase())) return null;
  if (!request.origin) {
    return policy.requireAdminOrigin ? { status: 403, errorCode: 'ADMIN_ORIGIN_REQUIRED', message: 'This request must come from the admin portal' } : null;
  }
  return policy.adminOrigins.map(originOf).includes(originOf(request.origin))
    ? null
    : { status: 403, errorCode: 'ADMIN_ORIGIN_REFUSED', message: 'This request must come from the admin portal' };
}

/** CORS for one request: the admin API admits only ADMIN_ORIGINS, every other route only CORS_ORIGINS. */
export function corsOptionsFor(path: string, policy: HttpBoundaryPolicy): CorsOptions {
  return {
    origin: [...(isAdminPath(path) ? policy.adminOrigins : policy.gameOrigins)],
    credentials: true,
    exposedHeaders: ['Content-Disposition', 'X-Trace-Id'],
    maxAge: 600,
  };
}

const pathOf = (request: Request): string => (request.originalUrl || request.url || '/').split('?')[0] ?? '/';

/**
 * Wire the browser-facing boundary on the HTTP app: per-route CORS and the admin request check. Runs before any
 * route, so it covers every admin endpoint (present and future). Used by `main.ts` and the boundary tests.
 */
export function configureHttpBoundary(app: INestApplication, policy: HttpBoundaryPolicy): void {
  app.enableCors((request: Request, callback: (error: Error | null, options: CorsOptions) => void) => callback(null, corsOptionsFor(pathOf(request), policy)));
  app.use((request: Request, response: Response, next: NextFunction) => {
    const refusal = adminRequestRefusal(
      { method: request.method, path: pathOf(request), origin: request.get('origin') ?? undefined, host: request.get('host') ?? undefined },
      policy,
    );
    if (!refusal) {
      next();
      return;
    }
    const body: ApiErrorBody = { errorCode: refusal.errorCode, message: refusal.message, timestamp: new Date().toISOString(), traceId: resolveTraceId(request) };
    response.status(refusal.status).json(body);
  });
}
