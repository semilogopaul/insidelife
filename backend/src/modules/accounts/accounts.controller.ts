import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AccountDeletionDto, OnboardingDto } from '@insidelife/shared';
import { AllowUnverifiedEmail } from '../../common/decorators/allow-unverified-email.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ReqMeta, type RequestMeta } from '../../common/decorators/request-meta.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from '../auth/auth.controller.js';
import { AccountLifecycleService } from './account-lifecycle.service.js';
import { AnnouncementSeenDto } from './dto/announcement-seen.dto.js';
import { DeleteAccountDto } from './dto/delete-account.dto.js';
import { TourOutcomeDto } from './dto/tour-outcome.dto.js';
import { WelcomeReactionDto } from './dto/welcome-reaction.dto.js';
import { UsersService } from '../users/users.service.js';

/** The signed-in player's own account. */
@Controller({ path: 'account', version: '1' })
export class AccountsController {
  constructor(
    private readonly lifecycle: AccountLifecycleService,
    private readonly users: UsersService,
  ) {}

  /** Which one-time prompts (welcome note, featured places) this account has already seen. */
  @Get('onboarding')
  onboarding(@CurrentUser() user: AuthUser): Promise<OnboardingDto> {
    return this.users.onboarding(user.userId);
  }

  /** Answer the welcome note (either button closes it; the first answer is recorded). */
  @HttpCode(HttpStatus.OK)
  @Post('onboarding/welcome')
  answerWelcome(@CurrentUser() user: AuthUser, @Body() body: WelcomeReactionDto): Promise<OnboardingDto> {
    return this.users.answerWelcome(user.userId, body.reaction);
  }

  /** The featured-places prompt was dismissed or used. */
  @HttpCode(HttpStatus.OK)
  @Post('onboarding/featured')
  featuredSeen(@CurrentUser() user: AuthUser): Promise<OnboardingDto> {
    return this.users.markFeaturedSeen(user.userId);
  }

  /** A "What's new" announcement was dismissed or used. */
  @HttpCode(HttpStatus.OK)
  @Post('onboarding/announcement')
  announcementSeen(@CurrentUser() user: AuthUser, @Body() body: AnnouncementSeenDto): Promise<OnboardingDto> {
    return this.users.markAnnouncementSeen(user.userId, body.id);
  }

  /** The guided walkthrough ended (finished or skipped). */
  @HttpCode(HttpStatus.OK)
  @Post('onboarding/tour')
  tourDone(@CurrentUser() user: AuthUser, @Body() body: TourOutcomeDto): Promise<OnboardingDto> {
    return this.users.markTourDone(user.userId, body.outcome);
  }

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
