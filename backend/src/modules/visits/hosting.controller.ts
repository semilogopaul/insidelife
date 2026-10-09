import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { HostingDto, HostingResultDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { ServeTreatDto } from './dto/hosting.dto.js';
import { HostingService } from './hosting.service.js';

/** Treating guests at home (host) and saying thanks (guest). */
@Controller({ path: 'visits', version: '1' })
export class HostingController {
  constructor(
    private readonly session: CharacterSession,
    private readonly hosting: HostingService,
  ) {}

  /** The Host sheet: guests inside, the menu priced for them, what's on the table. */
  @Get('hosting')
  view(@CurrentUser() user: AuthUser): Promise<HostingDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.hosting.view(ctx));
  }

  /** Serve a treat to everyone inside (the host pays; each guest feels it in their own session). */
  @Post('treats')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  serve(@CurrentUser() user: AuthUser, @Body() body: ServeTreatDto): Promise<HostingResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.hosting.serve(ctx, body), { touch: true });
  }

  /** A guest's thanks for the treats in this visit (free). */
  @Post(':id/thanks')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  thank(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.session.run({ userId: user.userId }, (ctx) => this.hosting.thank(ctx, id), { touch: true });
  }
}
