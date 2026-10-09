import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AppConfig } from '../../config/configuration.js';
import { ADMIN_ROUTE } from '../../common/decorators/admin-route.decorator.js';
import { ALLOW_UNVERIFIED_EMAIL } from '../../common/decorators/allow-unverified-email.decorator.js';
import { IS_PUBLIC } from '../../common/decorators/public.decorator.js';
import { AuthenticationRequiredException, EmailUnverifiedException } from '../../common/exceptions/domain.exception.js';
import type { AccessTokenPayload, AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { UsersService } from '../users/users.service.js';
import { SessionRevocationService } from './session-revocation.service.js';

export type AuthenticatedRequest = Request & { user?: AuthUser };

/**
 * Global guard: every route needs a valid Bearer access token unless marked @Public(). When
 * REQUIRE_EMAIL_VERIFICATION is on, also a confirmed email unless marked @AllowUnverifiedEmail(). Tokens issued
 * before the account was suspended or deleted are refused (`SessionRevocationService`). Admin API routes are left to
 * the admin guard. Also the token verifier for the realtime gateway and optional-auth endpoints.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly emailRequired: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    config: ConfigService<AppConfig, true>,
    private readonly revocations: SessionRevocationService,
  ) {
    this.emailRequired = config.get('auth', { infer: true }).requireEmailVerification;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ADMIN_ROUTE, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new AuthenticationRequiredException();

    const payload = await this.decode(token);
    if (!this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_EMAIL, targets)) await this.requireVerifiedEmail(payload);
    request.user = toAuthUser(payload);
    return true;
  }

  /** Signature and expiry only (the email may be unconfirmed). */
  async verify(token: string): Promise<AuthUser> {
    return toAuthUser(await this.decode(token));
  }

  /** Signature, expiry and (when required) a confirmed email: who may play (the realtime socket). */
  async verifyPlayer(token: string): Promise<AuthUser> {
    const payload = await this.decode(token);
    await this.requireVerifiedEmail(payload);
    return toAuthUser(payload);
  }

  private async decode(token: string): Promise<AccessTokenPayload> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new AuthenticationRequiredException('Your session expired. Please sign in again');
    }
    // `ia` is the issue time in ms; tokens without it count from the start of their `iat` second (the safe side).
    const issuedAtMs = payload.ia ?? (payload.iat === undefined ? undefined : payload.iat * 1000);
    if (await this.revocations.isCutOff(payload.sub, issuedAtMs)) throw new AuthenticationRequiredException('Your session ended. Please sign in again');
    return payload;
  }

  /**
   * Tokens issued after the email was confirmed say so (`ev`), at no cost. Older or pre-confirmation tokens check the
   * database, so a player who just entered their code isn't held back by a token from a minute ago.
   */
  private async requireVerifiedEmail(payload: AccessTokenPayload): Promise<void> {
    if (!this.emailRequired || payload.ev === true) return;
    const user = await this.users.findById(payload.sub);
    if (!user?.emailVerifiedAt) throw new EmailUnverifiedException();
  }
}

function toAuthUser(payload: AccessTokenPayload): AuthUser {
  return { userId: payload.sub, email: payload.email, role: payload.role };
}
