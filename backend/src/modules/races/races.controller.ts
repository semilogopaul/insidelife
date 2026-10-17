import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { RaceResultDto, RacesOverviewDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { CreateRaceDto } from './dto/races.dto.js';
import { RacesService } from './races.service.js';

/** Race a friend to the other city: the Flights app's Race tab. */
@Controller({ path: 'races', version: '1' })
export class RacesController {
  constructor(
    private readonly session: CharacterSession,
    private readonly races: RacesService,
  ) {}

  @Get()
  overview(@CurrentUser() user: AuthUser): Promise<RacesOverviewDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.races.overview(ctx));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateRaceDto): Promise<RaceResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run({ userId: user.userId }, (ctx) => ctx.once('race-create', idempotencyKey, request, () => this.races.create(ctx, request)), { touch: true });
  }

  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/acceptance')
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<RaceResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.races.accept(ctx, id), { touch: true });
  }

  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/decline')
  decline(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<RaceResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.races.decline(ctx, id), { touch: true });
  }

  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/cancellation')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<RaceResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.races.cancel(ctx, id), { touch: true });
  }
}
