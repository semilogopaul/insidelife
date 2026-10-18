import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  DecorAircraftDto,
  DecorArrangeResultDto,
  DecorChangeDto,
  DecorHomeDto,
  DecorPurchaseResultDto,
  DecorRecolourResultDto,
  DecorReplaceResultDto,
  DecorSellResultDto,
  DecorStateDto,
} from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { DecorService } from './decor.service.js';
import { DecorArrangeDto, DecorPlaceDto, DecorPurchaseDto, DecorRecolourDto, DecorReplaceDto, DecorSellDto } from './dto/decor.dto.js';

/** The Decor store and Decorate mode: what you own, buying, placing and showing visitors. */
@Controller({ path: 'decor', version: '1' })
export class DecorController {
  constructor(
    private readonly session: CharacterSession,
    private readonly decor: DecorService,
  ) {}

  @Get()
  state(@CurrentUser() user: AuthUser): Promise<DecorStateDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.decor.state(ctx));
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('purchases')
  purchase(@CurrentUser() user: AuthUser, @Body() body: DecorPurchaseDto): Promise<DecorPurchaseResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run(
      { userId: user.userId },
      (ctx) => ctx.once('decor-purchase', idempotencyKey, request, () => this.decor.purchase(ctx, request.itemId, request.variant, request.quantity ?? 1, request.place)),
      { touch: true },
    );
  }

  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @Put('pieces/:id/spot')
  place(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: DecorPlaceDto): Promise<DecorChangeDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.decor.place(ctx, id, body));
  }

  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @Delete('pieces/:id/spot')
  putBack(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<DecorChangeDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.decor.putBack(ctx, id));
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('pieces/:id/recolour')
  recolour(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: DecorRecolourDto): Promise<DecorRecolourResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run(
      { userId: user.userId },
      (ctx) => ctx.once('decor-recolour', idempotencyKey, { id, ...request }, () => this.decor.recolour(ctx, id, request.variant)),
      { touch: true },
    );
  }

  /** Sell a piece back to the furniture store. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('pieces/:id/sell')
  sell(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: DecorSellDto): Promise<DecorSellResultDto> {
    return this.session.run(
      { userId: user.userId },
      (ctx) => ctx.once('decor-sell', body.idempotencyKey, { id }, () => this.decor.sell(ctx, id)),
      { touch: true },
    );
  }

  /** The new piece takes an older one's place; the old is stored or sold back. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('pieces/:id/replace')
  replace(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: DecorReplaceDto): Promise<DecorReplaceResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run(
      { userId: user.userId },
      (ctx) => ctx.once('decor-replace', idempotencyKey, { id, ...request }, () => this.decor.replace(ctx, id, request.oldId, request.mode)),
      { touch: true },
    );
  }

  /** Put everything that isn't standing in your home into it, at good spots. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('arrange')
  arrange(@CurrentUser() user: AuthUser, @Body() body: DecorArrangeDto): Promise<DecorArrangeResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.decor.arrange(ctx, body.roomId));
  }

  @Get('homes/:hostId')
  home(@CurrentUser() user: AuthUser, @Param('hostId', ParseUUIDPipe) hostId: string): Promise<DecorHomeDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.decor.homeView(ctx, hostId));
  }

  /** A plane's cabin decor, for its owner and whoever is aboard. */
  @Get('aircraft/:aircraftId')
  aircraft(@CurrentUser() user: AuthUser, @Param('aircraftId', ParseUUIDPipe) aircraftId: string): Promise<DecorAircraftDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.decor.aircraftView(ctx, aircraftId));
  }

  /** Fit a piece in a room of one of your aircraft, or move/turn one that is there. */
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  @Put('aircraft/:aircraftId/pieces/:id/spot')
  placeInAircraft(
    @CurrentUser() user: AuthUser,
    @Param('aircraftId', ParseUUIDPipe) aircraftId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DecorPlaceDto,
  ): Promise<DecorChangeDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.decor.placeInAircraft(ctx, aircraftId, id, body));
  }
}
