import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { InventoryDto, InventoryRepairResultDto, InventorySaleResultDto } from '@insidelife/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { InventorySaleDto } from './dto/inventory-sale.dto.js';
import { InventoryService } from './inventory.service.js';
import { ShopService } from './shop.service.js';

/** Your belongings: list, resell, repair. */
@Controller({ path: 'inventory', version: '1' })
export class InventoryController {
  constructor(
    private readonly session: CharacterSession,
    private readonly shop: ShopService,
    private readonly inventory: InventoryService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<InventoryDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.shop.inventoryView(ctx));
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/sale')
  sell(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: InventorySaleDto,
  ): Promise<InventorySaleResultDto> {
    return this.session.run({ userId: user.userId }, (ctx) => this.inventory.sell(ctx, id, body.quantity ?? 1), { touch: true });
  }

  @Post(':id/repairs')
  repair(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<InventoryRepairResultDto> {
    return this.session.run(
      { userId: user.userId },
      async (ctx) => {
        const { stack, cost } = await this.inventory.repair(ctx, id);
        return { item: this.inventory.toDto(ctx, stack), cost, balance: ctx.wallet.cash };
      },
      { touch: true },
    );
  }
}
