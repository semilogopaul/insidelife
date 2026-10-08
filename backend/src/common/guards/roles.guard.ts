import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES } from '../decorators/roles.decorator.js';
import { ForbiddenActionException } from '../exceptions/domain.exception.js';
import type { AuthUser } from '../interfaces/auth-user.interface.js';

/** Use with `@UseGuards(RolesGuard)` + `@Roles('admin')` on moderation endpoints. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<ReadonlyArray<AuthUser['role']> | undefined>(ROLES, [context.getHandler(), context.getClass()]);
    if (!roles || roles.length === 0) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenActionException('Only moderators can do that');
    return true;
  }
}
