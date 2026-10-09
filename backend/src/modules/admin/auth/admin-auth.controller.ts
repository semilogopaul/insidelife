import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator.js';
import { ReqMeta, type RequestMeta } from '../../../common/decorators/request-meta.decorator.js';
import { DomainException, ForbiddenActionException } from '../../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../../config/configuration.js';
import { AdminRoute, CurrentAdmin } from '../common/admin.decorators.js';
import type {
  AdminChallengeDto,
  AdminMeDto,
  AdminPrincipal,
  AdminRecoveryCodesDto,
  AdminSessionDto,
  AdminSetupCompleteDto,
} from '../interfaces/admin-auth.interfaces.js';
import { AdminAuthService, type IssuedAdminSession } from './admin-auth.service.js';
import { AdminCodeDto, AdminMfaSetupDto, AdminMfaVerifyDto, AdminSignInDto } from './dto/admin-auth.dto.js';

export const ADMIN_REFRESH_COOKIE = 'il_admin_rt';
const ADMIN_REFRESH_PATH = '/api/v1/admin/auth';
/**
 * Cookie-authenticated calls (refresh, sign-out) must carry this header. A cross-site form can't set it, and setting it
 * from another origin forces a CORS preflight that only ADMIN_ORIGINS pass.
 */
export const ADMIN_CLIENT_HEADER = 'x-admin-client';

/**
 * Admin portal sign-in. Step 1 `sign-in` (email + password) answers with a challenge; step 2 is `mfa/setup` the first
 * time (scan the QR code, enter a code, save the recovery codes) or `mfa/verify` afterwards. Sessions refresh with an
 * httpOnly, SameSite=Strict cookie scoped to this path on the API's domain.
 */
@Controller({ path: 'admin/auth', version: '1' })
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('sign-in')
  signIn(@Body() body: AdminSignInDto, @ReqMeta() meta: RequestMeta): Promise<AdminChallengeDto> {
    return this.auth.signIn(body.email, body.password, meta);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('mfa/setup')
  async setUp(@Body() body: AdminMfaSetupDto, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response): Promise<AdminSetupCompleteDto> {
    const { issued, recoveryCodes } = await this.auth.confirmSetup(body.challengeToken, body.code, meta);
    return { ...this.respond(res, issued), recoveryCodes };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('mfa/verify')
  async verify(@Body() body: AdminMfaVerifyDto, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response): Promise<AdminSessionDto> {
    if (!body.code && !body.recoveryCode) throw new ForbiddenActionException('Enter the code from your authenticator app or a recovery code');
    return this.respond(res, await this.auth.verify(body.challengeToken, { code: body.code, recoveryCode: body.recoveryCode }, meta));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() req: Request, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response): Promise<AdminSessionDto> {
    this.requireClientHeader(req);
    try {
      return this.respond(res, await this.auth.refresh(this.cookieOf(req), meta));
    } catch (error) {
      if (error instanceof DomainException && (error.status === HttpStatus.UNAUTHORIZED || error.status === HttpStatus.FORBIDDEN)) this.clearCookie(res);
      throw error;
    }
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('sign-out')
  async signOut(@Req() req: Request, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response): Promise<void> {
    this.requireClientHeader(req);
    await this.auth.signOut(this.cookieOf(req), meta);
    this.clearCookie(res);
  }

  @AdminRoute()
  @Get('me')
  me(@CurrentAdmin() admin: AdminPrincipal): Promise<AdminMeDto> {
    return this.auth.me(admin);
  }

  /** Replace the recovery codes (needs a current authenticator code). The new ones are shown once. */
  @AdminRoute()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('recovery-codes')
  async recoveryCodes(@CurrentAdmin() admin: AdminPrincipal, @Body() body: AdminCodeDto, @ReqMeta() meta: RequestMeta, @Res({ passthrough: true }) res: Response): Promise<AdminRecoveryCodesDto> {
    res.setHeader('Cache-Control', 'no-store');
    return { recoveryCodes: await this.auth.regenerateRecoveryCodes(admin, body.code, meta) };
  }

  private respond(res: Response, issued: IssuedAdminSession): AdminSessionDto {
    res.cookie(ADMIN_REFRESH_COOKIE, issued.refreshToken, {
      httpOnly: true,
      secure: this.config.get('auth', { infer: true }).cookieSecure,
      // The portal (admin.insidelife.online) and the API (insidelife.online) are the same site, so Strict still sends it.
      sameSite: 'strict',
      path: ADMIN_REFRESH_PATH,
      expires: issued.refreshExpiresAt,
    });
    res.setHeader('Cache-Control', 'no-store');
    return issued.session;
  }

  private clearCookie(res: Response): void {
    res.clearCookie(ADMIN_REFRESH_COOKIE, { path: ADMIN_REFRESH_PATH });
  }

  private cookieOf(req: Request): string | undefined {
    return (req.cookies as Record<string, string | undefined> | undefined)?.[ADMIN_REFRESH_COOKIE];
  }

  private requireClientHeader(req: Request): void {
    if (req.get(ADMIN_CLIENT_HEADER) !== 'portal') throw new ForbiddenActionException('This request must come from the admin portal');
  }
}
