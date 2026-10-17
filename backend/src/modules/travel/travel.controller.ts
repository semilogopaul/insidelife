import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FlightPassengersDto, FlightSearchDto, FlightsOverviewDto, TravelActionResultDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { SnapshotService } from '../life/snapshot.service.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { BusService } from './bus.service.js';
import { BookBusDto, BookFlightDto, ChangeFlightDto, FlightSearchQueryDto } from './dto/travel.dto.js';
import { FlightsService } from './flights.service.js';

/** Between the cities: the Flights phone app and the interstate coach. */
@Controller({ path: 'flights', version: '1' })
export class FlightsController {
  constructor(
    private readonly session: CharacterSession,
    private readonly flights: FlightsService,
    private readonly snapshots: SnapshotService,
  ) {}

  @Get()
  overview(@CurrentUser() user: AuthUser): Promise<FlightsOverviewDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.flights.overview(ctx));
  }

  @Get('search')
  search(@CurrentUser() user: AuthUser, @Query() query: FlightSearchQueryDto): Promise<FlightSearchDto> {
    return this.session.run({ userId: user.userId }, async (ctx) => this.flights.search(ctx, query.from, query.day));
  }

  /** The others aboard the commercial flight you are on, to fill the cabin with. */
  @Get(':flightId/passengers')
  passengers(@CurrentUser() user: AuthUser, @Param('flightId') flightId: string): Promise<FlightPassengersDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.flights.passengers(ctx, flightId));
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('bookings')
  book(@CurrentUser() user: AuthUser, @Body() body: BookFlightDto): Promise<TravelActionResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run(
      { userId: user.userId },
      (ctx) => ctx.once('flight-book', idempotencyKey, request, () => this.result(ctx, () => this.flights.book(ctx, request.flightId, request.cabin, request.channel))),
      { touch: true },
    );
  }

  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('bookings/:id/check-in')
  checkIn(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<TravelActionResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.result(ctx, () => this.flights.checkIn(ctx, id)), { touch: true });
  }

  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('bookings/:id/board')
  board(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<TravelActionResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.result(ctx, () => this.flights.board(ctx, id)), { touch: true });
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('bookings/:id/change')
  change(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: ChangeFlightDto): Promise<TravelActionResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run(
      { userId: user.userId },
      (ctx) => ctx.once('flight-change', idempotencyKey, { id, ...request }, () => this.result(ctx, () => this.flights.change(ctx, id, request.flightId))),
      { touch: true },
    );
  }

  /** Run an action, then answer with the app's new state and the character's snapshot. */
  private async result(ctx: SimulationContext, act: () => Promise<unknown>): Promise<TravelActionResultDto> {
    await act();
    return { overview: await this.flights.overview(ctx), snapshot: await this.snapshots.build(ctx) };
  }
}

@Controller({ path: 'travel', version: '1' })
export class CoachController {
  constructor(
    private readonly session: CharacterSession,
    private readonly flights: FlightsService,
    private readonly bus: BusService,
    private readonly snapshots: SnapshotService,
  ) {}

  /** Board the interstate coach at the city's motor park. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('bus')
  book(@CurrentUser() user: AuthUser, @Body() body: BookBusDto): Promise<TravelActionResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run(
      { userId: user.userId },
      (ctx) =>
        ctx.once('bus-book', idempotencyKey, request, async () => {
          await this.bus.book(ctx, request.toCity);
          return { overview: await this.flights.overview(ctx), snapshot: await this.snapshots.build(ctx) };
        }),
      { touch: true },
    );
  }
}
