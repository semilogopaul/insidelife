import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { EmploymentViewDto, PromotionResultDto, ResignationResultDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { RequestLeaveDto } from './dto/careers.dto.js';
import { EmploymentViewService } from './employment-view.service.js';
import { EmploymentService } from './employment.service.js';
import { PromotionsService } from './promotions.service.js';

/** The Jobs app "My job" tab: current job, promotion requests, leave and resignation. */
@Controller({ path: 'employment', version: '1' })
export class EmploymentController {
  constructor(
    private readonly session: CharacterSession,
    private readonly views: EmploymentViewService,
    private readonly employment: EmploymentService,
    private readonly promotions: PromotionsService,
  ) {}

  @Get()
  view(@CurrentUser() user: AuthUser): Promise<EmploymentViewDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.views.view(ctx));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('promotion-requests')
  requestPromotion(@CurrentUser() user: AuthUser): Promise<PromotionResultDto> {
    return this.session.run(
      { userId: user.userId },
      async (ctx) => {
        const decision = await this.promotions.request(ctx);
        const employment = await this.employment.requireActive(ctx);
        return { ...decision, employment: await this.views.employmentDto(ctx, employment) };
      },
      { touch: true },
    );
  }

  @Post('leave')
  requestLeave(@CurrentUser() user: AuthUser, @Body() body: RequestLeaveDto): Promise<EmploymentViewDto> {
    return this.session.run(
      { userId: user.userId },
      async (ctx) => {
        await this.employment.requestLeave(ctx, body.days);
        return this.views.view(ctx);
      },
      { touch: true },
    );
  }

  @Delete()
  resign(@CurrentUser() user: AuthUser): Promise<ResignationResultDto> {
    return this.session.run(
      { userId: user.userId },
      async (ctx) => {
        const result = await this.employment.resign(ctx);
        return { ...result, view: await this.views.view(ctx) };
      },
      { touch: true },
    );
  }
}
