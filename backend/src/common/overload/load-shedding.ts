import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiErrorBody } from '@insidelife/shared';
import { resolveTraceId, TRACE_HEADER } from '../utils/trace.js';
import { OVERLOAD_RETRY_AFTER_SECONDS } from './overload-monitor.service.js';

/**
 * Never shed: the probes (a busy node isn't a dead one), Flutterwave's webhook (money that landed must be recorded;
 * Flutterwave would retry, but late), and the token refresh (a refused refresh would sign players out later).
 */
const NEVER_SHED: readonly RegExp[] = [
  /^\/api\/health(?:\/|$)/,
  /^\/api\/metrics(?:\/|$)/,
  /^\/api\/v1\/payments\/flutterwave\/webhook(?:\/|$)/,
  /^\/api\/v1\/auth\/refresh(?:\/|$)/,
];

export const isNeverShed = (path: string): boolean => NEVER_SHED.some((pattern) => pattern.test(path));

/**
 * Express middleware, early in the pipeline (after CORS, before body parsing, guards and the handler): while the node
 * is overloaded a new request is answered at once with 503 SERVER_BUSY and `Retry-After`, instead of joining a queue it
 * would time out in. Nothing ran for it, so the client may simply retry. A request already being handled is unaffected.
 */
export function loadShedding(monitor: { readonly overloaded: boolean }, onShed: () => void = () => undefined): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!monitor.overloaded || isNeverShed(request.path)) return next();
    onShed();
    const traceId = resolveTraceId(request);
    const body: ApiErrorBody = {
      errorCode: 'SERVER_BUSY',
      message: 'Lagos is busy right now. Try again in a moment.',
      timestamp: new Date().toISOString(),
      traceId,
    };
    response.setHeader(TRACE_HEADER, traceId);
    response.setHeader('Retry-After', String(OVERLOAD_RETRY_AFTER_SECONDS));
    response.setHeader('Cache-Control', 'no-store');
    response.status(503).json(body);
  };
}
