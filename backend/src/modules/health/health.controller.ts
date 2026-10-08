import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CheckUpResponseDto, HealthViewDto, TreatmentResponseDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { JoinHmoDto } from './dto/join-hmo.dto.js';
import { StartTreatmentDto } from './dto/start-treatment.dto.js';
import { HealthService } from './health.service.js';

/** The Health app: conditions and symptoms, treatment, check-ups and HMO plans. */
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly session: CharacterSession,
    private readonly health: HealthService,
  ) {}

  @Get()
  view(@CurrentUser() user: AuthUser): Promise<HealthViewDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.health.view(ctx));
  }

  /** Start treatment for a condition (or an antenatal visit) at the pharmacy/hospital the character is in. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('treatments')
  startTreatment(@CurrentUser() user: AuthUser, @Body() body: StartTreatmentDto): Promise<TreatmentResponseDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.health.startTreatment(ctx, body.conditionId), { touch: true });
  }

  /** Get examined (diagnoses what this facility can test for). */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('check-ups')
  checkUp(@CurrentUser() user: AuthUser): Promise<CheckUpResponseDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.health.checkUp(ctx), { touch: true });
  }

  /** Join (or switch to) an HMO plan; the first month's premium is charged now. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('insurance')
  joinInsurance(@CurrentUser() user: AuthUser, @Body() body: JoinHmoDto): Promise<HealthViewDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.health.joinInsurance(ctx, body.planId), { touch: true });
  }

  @Delete('insurance')
  cancelInsurance(@CurrentUser() user: AuthUser): Promise<HealthViewDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.health.cancelInsurance(ctx), { touch: true });
  }
}
