import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AccountDeletionDto } from '@insidelife/shared';
import { AllowUnverifiedEmail } from '../../common/decorators/allow-unverified-email.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ReqMeta, type RequestMeta } from '../../common/decorators/request-meta.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from '../auth/auth.controller.js';
import { AccountLifecycleService } from './account-lifecycle.service.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';

/** The signed-in player's own account. */
@Controller({ path: 'account', version: '1' })
export class AccountsController {
  constructor(private readonly lifecycle: AccountLifecycleService) {}

  /**
   * Delete my account (soft delete). Needs the password and the confirmation phrase. Ends every session, including
   * this one: the refresh cookie is cleared.
   */
  @AllowUnverifiedEmail()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('deletion')
  async delete(
    @CurrentUser() user: AuthUser,
    @Body() body: DeleteAccountDto,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccountDeletionDto> {
    const deleted = await this.lifecycle.deleteOwn(user.userId, body, meta);
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    res.setHeader('Cache-Control', 'no-store');
    return deleted;
  }
}
