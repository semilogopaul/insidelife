import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { NightOutDto, NightOutResultDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { NightOutRequestDto } from './dto/night-out.dto.js';
import { VenueParamsDto } from './dto/players.dto.js';
import { NightOutService } from './night-out.service.js';

/** Club nights: the menu (bottles, shoutouts, experiences) and buying a moment the whole room sees. */
@Controller({ path: 'venues', version: '1' })
export class NightOutController {
  constructor(
    private readonly session: CharacterSession,
    private readonly nightOut: NightOutService,
  ) {}

  @Get(':venueId/night-out')
  view(@CurrentUser() user: AuthUser, @Param() params: VenueParamsDto): Promise<NightOutDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.nightOut.view(ctx, params.venueId));
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':venueId/moments')
  buy(@CurrentUser() user: AuthUser, @Param() params: VenueParamsDto, @Body() body: NightOutRequestDto): Promise<NightOutResultDto> {
    return this.session.run(
      { userId: user.userId },
      (ctx) =>
        this.nightOut.buy(ctx, params.venueId, {
          itemId: body.itemId,
          toHandle: body.toHandle ?? null,
          message: body.message ?? null,
          idempotencyKey: body.idempotencyKey,
        }),
      { touch: true },
    );
  }
}
