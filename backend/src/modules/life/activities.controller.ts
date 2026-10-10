import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CharacterSnapshotDto, ExitResultDto, FuelPurchaseResultDto, MechanicVisitResultDto, MovementHeartbeatResultDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { ActionsService } from './actions.service.js';
import { StartActionDto } from './dto/action.dto.js';
import { EnterLocationDto, FuelPurchaseDto, HeartbeatDto, MechanicVisitDto, QuoteQueryDto, TravelDto } from './dto/movement.dto.js';
import { MovementService, type TravelQuoteDto } from './movement.service.js';
import { SnapshotService } from './snapshot.service.js';

/** Things the character does: actions, rides, and moving through the open world. */
@Controller({ path: 'characters/me', version: '1' })
export class ActivitiesController {
  constructor(
    private readonly session: CharacterSession,
    private readonly actions: ActionsService,
    private readonly movement: MovementService,
    private readonly snapshots: SnapshotService,
  ) {}

  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Post('actions')
  startAction(@CurrentUser() user: AuthUser, @Body() body: StartActionDto): Promise<CharacterSnapshotDto> {
    return this.session.run(
      { userId: user.userId },
      async (ctx) => {
        await this.actions.start(ctx, body.actionId, body.durationMinutes, body.targetId);
        return this.snapshots.build(ctx);
      },
      { touch: true },
    );
  }

  @Delete('actions/current')
  cancelAction(@CurrentUser() user: AuthUser): Promise<CharacterSnapshotDto> {
    return this.session.run(
      { userId: user.userId },
      async (ctx) => {
        this.actions.cancel(ctx);
        return this.snapshots.build(ctx);
      },
      { touch: true },
    );
  }

  @Get('travel/quotes')
  quotes(@CurrentUser() user: AuthUser, @Query() query: QuoteQueryDto): Promise<TravelQuoteDto[]> {
    return this.session.run({ userId: user.userId }, (ctx) => this.movement.quotes(ctx, query.destinationId));
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('travel')
  travel(@CurrentUser() user: AuthUser, @Body() body: TravelDto): Promise<CharacterSnapshotDto> {
    return this.session.run(
      { userId: user.userId },
      async (ctx) => {
        await this.movement.travel(ctx, body.destinationId, body.mode, body.acceptClosed === true);
        return this.snapshots.build(ctx);
      },
      { touch: true },
    );
  }

  @Post('exits')
  exit(@CurrentUser() user: AuthUser): Promise<ExitResultDto> {
    return this.session.run(
      { userId: user.userId },
      async (ctx) => ({ spawn: await this.movement.exit(ctx), snapshot: await this.snapshots.build(ctx) }),
      { touch: true },
    );
  }

  @Post('entries')
  enter(@CurrentUser() user: AuthUser, @Body() body: EnterLocationDto): Promise<CharacterSnapshotDto> {
    return this.session.run(
      { userId: user.userId },
      async (ctx) => {
        await this.movement.enter(ctx, body.locationId, body.position, body.mode);
        return this.snapshots.build(ctx);
      },
      { touch: true },
    );
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('heartbeats')
  heartbeat(@CurrentUser() user: AuthUser, @Body() body: HeartbeatDto): Promise<MovementHeartbeatResultDto> {
    return this.session.run(
      { userId: user.userId },
      (ctx) => this.movement.heartbeat(ctx, body.position, body.mode, body.heading, body.bumps),
      { touch: true },
    );
  }

  /** Buy fuel at a filling station on the street (fill up, or `litres`). */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('fuel-purchases')
  buyFuel(@CurrentUser() user: AuthUser, @Body() body: FuelPurchaseDto): Promise<FuelPurchaseResultDto> {
    return this.session.run(
      { userId: user.userId },
      async (ctx) => ({ ...(await this.movement.buyFuel(ctx, body.stationId, body.position, body.litres ?? null, body.idempotencyKey)), balance: ctx.wallet.cash }),
      { touch: true },
    );
  }

  /** A proper repair at a mechanic workshop on the street. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mechanic-visits')
  seeMechanic(@CurrentUser() user: AuthUser, @Body() body: MechanicVisitDto): Promise<MechanicVisitResultDto> {
    return this.session.run(
      { userId: user.userId },
      async (ctx) => ({ ...(await this.movement.seeMechanic(ctx, body.workshopId, body.position, body.idempotencyKey)), balance: ctx.wallet.cash }),
      { touch: true },
    );
  }
}
