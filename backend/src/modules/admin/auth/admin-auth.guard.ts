import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AdminPrincipal } from '../interfaces/admin-auth.interfaces.js';
import { AdminSessionEndedException } from './admin-auth.errors.js';
import { AdminAuthService } from './admin-auth.service.js';

export type AdminRequest = Request & { admin?: AdminPrincipal };

/**
 * Every admin API route: a Bearer admin access token (issued only after password + authenticator code), a live admin
 * session, and an account that is still an admin in good standing. Player tokens never pass (different key and
 * audience).
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new AdminSessionEndedException('Sign in to continue');
    request.admin = await this.auth.authenticate(token);
    return true;
  }
}
