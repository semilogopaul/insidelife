import { applyDecorators, createParamDecorator, UseGuards, type ExecutionContext } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminRouteMarker } from '../../../common/decorators/admin-route.decorator.js';
import { requestMetaOf } from '../../../common/decorators/request-meta.decorator.js';
import type { AuditActor } from '../../audit/audit.types.js';
import { AdminSessionEndedException } from '../auth/admin-auth.errors.js';
import { AdminAuthGuard, type AdminRequest } from '../auth/admin-auth.guard.js';
import type { AdminPrincipal } from '../interfaces/admin-auth.interfaces.js';

/** Admin API controller or route: admin token required (not a player token), and a rate limit per caller. */
export const AdminRoute = (): ClassDecorator & MethodDecorator =>
  applyDecorators(AdminRouteMarker(), UseGuards(AdminAuthGuard), Throttle({ default: { limit: 180, ttl: 60_000 } }));

/** Tighter limit for CSV exports (each reads up to 50k rows). */
export const ExportThrottle = (): MethodDecorator & ClassDecorator => Throttle({ default: { limit: 10, ttl: 60_000 } });

function principalOf(context: ExecutionContext): AdminPrincipal {
  const admin = context.switchToHttp().getRequest<AdminRequest>().admin;
  if (!admin) throw new AdminSessionEndedException('Sign in to continue');
  return admin;
}

/** The signed-in admin. */
export const CurrentAdmin = createParamDecorator((_: unknown, context: ExecutionContext): AdminPrincipal => principalOf(context));

/** The signed-in admin as the audit log's actor: who, plus the request's IP, user agent and trace id. */
export const Actor = createParamDecorator((_: unknown, context: ExecutionContext): AuditActor => {
  const admin = principalOf(context);
  const meta = requestMetaOf(context.switchToHttp().getRequest<AdminRequest>());
  return { userId: admin.userId, email: admin.email, role: admin.role, ...meta };
});
