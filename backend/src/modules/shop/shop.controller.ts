import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ShopCatalogDto, ShopPurchaseResultDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { ShopPurchaseDto } from './dto/shop-purchase.dto.js';
import { ShopQueryDto } from './dto/shop-query.dto.js';
import { ShopService } from './shop.service.js';

/** The Shop app: catalogue and purchases (in-store or delivered). */
@Controller({ path: 'shop', version: '1' })
export class ShopController {
  constructor(
    private readonly session: CharacterSession,
    private readonly shop: ShopService,
  ) {}

  @Get()
  catalogue(@CurrentUser() user: AuthUser, @Query() query: ShopQueryDto): Promise<ShopCatalogDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.shop.catalogue(ctx, query));
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('purchases')
  purchase(@CurrentUser() user: AuthUser, @Body() body: ShopPurchaseDto): Promise<ShopPurchaseResultDto> {
    const { idempotencyKey, ...request } = body;
    return this.session.run(
      { userId: user.userId },
      (ctx) => ctx.once('shop-purchase', idempotencyKey, request, () => this.shop.purchase(ctx, request.itemId, request.quantity ?? 1, request.roomId)),
      { touch: true },
    );
  }
}
