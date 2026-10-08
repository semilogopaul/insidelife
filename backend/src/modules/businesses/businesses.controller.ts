import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { BusinessExitDto, BusinessesViewDto, OwnedBusinessDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { BusinessesService } from './businesses.service.js';
import { BusinessParamsDto, StartBusinessDto } from './dto/businesses.dto.js';

/** The Business app: catalogue and your businesses (start, expand, sell, close). */
@Controller({ path: 'businesses', version: '1' })
export class BusinessesController {
  constructor(
    private readonly session: CharacterSession,
    private readonly businesses: BusinessesService,
  ) {}

  @Get()
  view(@CurrentUser() user: AuthUser): Promise<BusinessesViewDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.businesses.view(ctx));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  start(@CurrentUser() user: AuthUser, @Body() body: StartBusinessDto): Promise<OwnedBusinessDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.businesses.start(ctx, body), { touch: true });
  }

  @Post(':id/expansions')
  expand(@CurrentUser() user: AuthUser, @Param() params: BusinessParamsDto): Promise<OwnedBusinessDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.businesses.expand(ctx, params.id), { touch: true });
  }

  @Post(':id/sale')
  sell(@CurrentUser() user: AuthUser, @Param() params: BusinessParamsDto): Promise<BusinessExitDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.businesses.sell(ctx, params.id), { touch: true });
  }

  @Delete(':id')
  close(@CurrentUser() user: AuthUser, @Param() params: BusinessParamsDto): Promise<BusinessExitDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.businesses.close(ctx, params.id), { touch: true });
  }
}
