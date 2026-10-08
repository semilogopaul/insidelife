import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC } from '../../common/decorators/public.decorator.js';
import { AuthenticationRequiredException } from '../../common/exceptions/domain.exception.js';
import type { AccessTokenPayload, AuthUser } from '../../common/interfaces/auth-user.interface.js';

export type AuthenticatedRequest = Request & { user?: AuthUser };

/** Global guard: every route needs a valid Bearer access token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new AuthenticationRequiredException();

    request.user = await this.verify(token);
    return true;
  }

  async verify(token: string): Promise<AuthUser> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      return { userId: payload.sub, email: payload.email, role: payload.role };
    } catch {
      throw new AuthenticationRequiredException('Your session expired. Please sign in again');
    }
  }
}
