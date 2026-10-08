import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthSessionDto, AuthUserDto } from '@insidelife/shared';
import type { AppConfig } from '../../config/configuration.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { AuthService, type IssuedSession } from './auth.service.js';
import { LoginDto, RegisterDto } from './dto/credentials.dto.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';

export const REFRESH_COOKIE = 'il_rt';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('register')
  async register(@Body() body: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthSessionDto> {
    return this.respond(res, await this.auth.register(body.email, body.password, req.get('user-agent')));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthSessionDto> {
    return this.respond(res, await this.auth.login(body.email, body.password, req.get('user-agent')));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthSessionDto> {
    try {
      return this.respond(res, await this.auth.refresh(this.cookieOf(req), req.get('user-agent')));
    } catch (error) {
      this.clearCookie(res);
      throw error;
    }
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(this.cookieOf(req));
    this.clearCookie(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<AuthUserDto> {
    return this.auth.describe(user.userId);
  }

  private respond(res: Response, issued: IssuedSession): AuthSessionDto {
    res.cookie(REFRESH_COOKIE, issued.refreshToken, {
      httpOnly: true,
      secure: this.config.get('auth', { infer: true }).cookieSecure,
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      expires: issued.refreshExpiresAt,
    });
    res.setHeader('Cache-Control', 'no-store');
    return issued.session;
  }

  private clearCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  private cookieOf(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }
}
