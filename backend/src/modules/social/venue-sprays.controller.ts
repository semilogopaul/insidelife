import { Body, Controller, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { VenueSprayResultDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { VenueSprayDto } from './dto/party.dto.js';
import { VenueParamsDto } from './dto/players.dto.js';
import { VenueSpraysService } from './venue-sprays.service.js';

/** Spraying in clubs and bars, no party needed. */
@Controller({ path: 'venues', version: '1' })
export class VenueSpraysController {
  constructor(
    private readonly session: CharacterSession,
    private readonly sprays: VenueSpraysService,
  ) {}

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post(':venueId/sprays')
  spray(@CurrentUser() user: AuthUser, @Param() params: VenueParamsDto, @Body() body: VenueSprayDto): Promise<VenueSprayResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.sprays.spray(ctx, params.venueId, { toHandle: body.toHandle ?? null, amount: body.amount, idempotencyKey: body.idempotencyKey }), {
      touch: true,
    });
  }
}
