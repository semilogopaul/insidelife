import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { traceIdOf } from '../utils/trace.js';

/** Where a request came from, for the audit log. `ip` honours TRUST_PROXY_HOPS (Express `trust proxy`). */
export interface RequestMeta {
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly traceId: string | null;
}

export function requestMetaOf(request: Request): RequestMeta {
  return {
    ip: request.ip?.slice(0, 64) ?? null,
    userAgent: request.get('user-agent')?.slice(0, 255) ?? null,
    traceId: traceIdOf(request as unknown as { id?: unknown }).slice(0, 64),
  };
}

/** `@ReqMeta() meta: RequestMeta`: the caller's IP, user agent and trace id. */
export const ReqMeta = createParamDecorator((_: unknown, context: ExecutionContext): RequestMeta =>
  requestMetaOf(context.switchToHttp().getRequest<Request>()),
);
