import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AircraftChangeResultDto,
  AircraftFlightResultDto,
  AircraftPurchaseResultDto,
  AircraftReinstatementResultDto,
  AircraftSaleResultDto,
  ApronDto,
  HangarDto,
  PilotTrainingStepResultDto,
} from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { AviationService } from './aviation.service.js';
import { AircraftFlightDto, AircraftLiveryDto, AircraftNameDto, AircraftPurchaseDto, AircraftRegistrationDto, TapOnceDto } from './dto/aviation.dto.js';
import { PilotTrainingService } from './pilot-training.service.js';

/** The Hangar app: private aircraft, the Private Pilot Licence and flights between the General Aviation Terminals. */
@Controller({ path: 'aircraft', version: '1' })
export class AviationController {
  constructor(
    private readonly session: CharacterSession,
    private readonly aviation: AviationService,
    private readonly training: PilotTrainingService,
  ) {}

  @Get()
  overview(@CurrentUser() user: AuthUser): Promise<HangarDto> {
    return this.session.run({ userId: user.userId }, async (ctx) => this.aviation.view(ctx, await this.training.status(ctx)));
  }

  /** Other players' planes parked at a terminal (friends first, then the players there; the rest are "in hangars"). */
  @Get('apron/:gat')
  apron(@CurrentUser() user: AuthUser, @Param('gat') gat: string): Promise<ApronDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.aviation.apron(ctx, gat));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('purchases')
  purchase(@CurrentUser() user: AuthUser, @Body() body: AircraftPurchaseDto): Promise<AircraftPurchaseResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run({ userId: user.userId }, (ctx) => ctx.once('aircraft-purchase', idempotencyKey, request, () => this.aviation.purchase(ctx, request)), { touch: true });
  }

  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/sale')
  sell(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: TapOnceDto): Promise<AircraftSaleResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => ctx.once('aircraft-sale', body.idempotencyKey, { id }, () => this.aviation.sell(ctx, id)), { touch: true });
  }

  @Put(':id/livery')
  livery(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: AircraftLiveryDto): Promise<AircraftChangeResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run({ userId: user.userId }, (ctx) => ctx.once('aircraft-livery', idempotencyKey, { id, ...request }, () => this.aviation.setLivery(ctx, id, request.base, request.accent)), { touch: true });
  }

  @Put(':id/name')
  name(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: AircraftNameDto): Promise<AircraftChangeResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run({ userId: user.userId }, (ctx) => ctx.once('aircraft-name', idempotencyKey, { id, ...request }, () => this.aviation.setName(ctx, id, request.name)), { touch: true });
  }

  @Put(':id/registration')
  registration(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: AircraftRegistrationDto): Promise<AircraftChangeResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run({ userId: user.userId }, (ctx) => ctx.once('aircraft-registration', idempotencyKey, { id, ...request }, () => this.aviation.setRegistration(ctx, id, request.registration)), { touch: true });
  }

  /** Settle unpaid hangar, crew and maintenance bills and clear a grounded aircraft to fly. */
  @HttpCode(HttpStatus.OK)
  @Post(':id/reinstatement')
  reinstate(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: TapOnceDto): Promise<AircraftReinstatementResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => ctx.once('aircraft-reinstatement', body.idempotencyKey, { id }, () => this.aviation.reinstate(ctx, id)), { touch: true });
  }

  /** Fly to the other terminal. You must be standing at the aircraft's terminal. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/flights')
  fly(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: AircraftFlightDto): Promise<AircraftFlightResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run({ userId: user.userId }, (ctx) => ctx.once('aircraft-flight', idempotencyKey, { id, ...request }, () => this.aviation.fly(ctx, id, request.destination)), { touch: true });
  }

  // ----- Private Pilot Licence ---------------------------------------------------------------------------------------

  @Post('pilot-training/enrolment')
  enrol(@CurrentUser() user: AuthUser, @Body() body: TapOnceDto): Promise<PilotTrainingStepResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => ctx.once('ppl-enrol', body.idempotencyKey, {}, () => this.training.enrol(ctx)), { touch: true });
  }

  @Post('pilot-training/lessons')
  lesson(@CurrentUser() user: AuthUser, @Body() body: TapOnceDto): Promise<PilotTrainingStepResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => ctx.once('ppl-lesson', body.idempotencyKey, {}, () => this.training.startLesson(ctx)), { touch: true });
  }

  @Post('pilot-training/check-rides')
  checkRide(@CurrentUser() user: AuthUser, @Body() body: TapOnceDto): Promise<PilotTrainingStepResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => ctx.once('ppl-check-ride', body.idempotencyKey, {}, () => this.training.startCheckRide(ctx)), { touch: true });
  }
}
