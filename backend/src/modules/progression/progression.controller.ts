import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AchievementsOverviewDto,
  DailyWelcomeResultDto,
  MilestoneAcknowledgementDto,
  MilestoneMomentDto,
  ProgressionOverviewDto,
  SuggestionDto,
} from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { ProgressionService } from './progression.service.js';

/** Life Goals, achievements, milestone moments, the daily welcome and HUD suggestions. */
@Controller({ path: 'progression', version: '1' })
export class ProgressionController {
  constructor(
    private readonly session: CharacterSession,
    private readonly progression: ProgressionService,
  ) {}

  @Get()
  overview(@CurrentUser() user: AuthUser): Promise<ProgressionOverviewDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.progression.overview(ctx, user.userId, Date.now()));
  }

  @Get('achievements')
  achievements(@CurrentUser() user: AuthUser): Promise<AchievementsOverviewDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.progression.achievementsOverview(ctx));
  }

  @Get('milestones')
  milestones(@CurrentUser() user: AuthUser): Promise<MilestoneMomentDto[]> {
    return this.session.run({ userId: user.userId }, (ctx) => this.progression.pendingMilestones(ctx));
  }

  @Post('milestones/:id/acknowledgement')
  @HttpCode(HttpStatus.OK)
  acknowledge(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<MilestoneAcknowledgementDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.progression.acknowledgeMilestone(ctx, id), { touch: true });
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('daily-welcome')
  @HttpCode(HttpStatus.OK)
  claimDailyWelcome(@CurrentUser() user: AuthUser): Promise<DailyWelcomeResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.progression.claimDailyWelcome(ctx, user.userId, Date.now()), { touch: true });
  }

  @Get('suggestions')
  suggestions(@CurrentUser() user: AuthUser): Promise<SuggestionDto[]> {
    return this.session.run({ userId: user.userId }, (ctx) => this.progression.nextSteps(ctx));
  }
}
