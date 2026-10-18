import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { HotelBookingResultDto, HotelCheckoutResultDto, HotelsDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { HotelBookingDto, HotelCheckoutDto } from './dto/hotels.dto.js';
import { HotelsService } from './hotels.service.js';

/** The Stay app: hotels in both cities, booking at reception, extending and checking out. */
@Controller({ path: 'hotels', version: '1' })
export class HotelsController {
  constructor(
    private readonly session: CharacterSession,
    private readonly hotels: HotelsService,
  ) {}

  @Get()
  overview(@CurrentUser() user: AuthUser): Promise<HotelsDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.hotels.view(ctx));
  }

  /** Book a night or several at the hotel you are standing in (or extend your stay there). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('stays')
  book(@CurrentUser() user: AuthUser, @Body() body: HotelBookingDto): Promise<HotelBookingResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run({ userId: user.userId }, (ctx) => ctx.once('hotel-stay', idempotencyKey, request, () => this.hotels.book(ctx, request.venueId, request.nights)), { touch: true });
  }

  /** Give the room back now. */
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('stay/checkout')
  checkout(@CurrentUser() user: AuthUser, @Body() body: HotelCheckoutDto): Promise<HotelCheckoutResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => ctx.once('hotel-checkout', body.idempotencyKey, {}, () => this.hotels.checkout(ctx)), { touch: true });
  }
}
