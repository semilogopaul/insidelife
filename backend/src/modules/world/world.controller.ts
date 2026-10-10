import { Controller, Get, Header } from '@nestjs/common';
import type { WorldClockDto, WorldStateDto } from '@insidelife/shared';
import { Public } from '../../common/decorators/public.decorator.js';
import { PresenceService } from '../presence/presence.service.js';
import { WorldService } from './world.service.js';

@Controller({ path: 'world', version: '1' })
export class WorldController {
  constructor(
    private readonly world: WorldService,
    private readonly presence: PresenceService,
  ) {}

  @Public()
  @Get('clock')
  @Header('Cache-Control', 'no-store')
  clock(): WorldClockDto {
    return { ...this.world.clock, serverNowMs: Date.now(), worldSeed: this.world.seed, nextRescale: this.world.nextRescale };
  }

  @Public()
  @Get('state')
  @Header('Cache-Control', 'public, max-age=15')
  async state(): Promise<WorldStateDto> {
    const t = this.world.now();
    return {
      gameMinute: t,
      weather: this.world.weather(t),
      economy: this.world.economy(t),
      events: this.world.events(t),
      onlinePlayers: await this.presence.onlineCount(),
      headline: this.world.headline(t),
    };
  }
}
