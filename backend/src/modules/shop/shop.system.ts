import { Injectable, type OnModuleInit } from '@nestjs/common';
import { STARTER_ITEMS, findProduct, type ItemCategory } from '@insidelife/shared';
import { LifeEventsRegistry } from '../events/life-events.registry.js';
import type { SimulationSystem, SummaryContribution } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { InventoryService } from './inventory.service.js';
import { outfitStatus, starterOutfit, starterWardrobeFor } from './rules/outfit.rules.js';
import { shopLifeEvents } from './shop.events.js';
import { ShopService } from './shop.service.js';

/** Belongings that stay at home (what the 3D home shows); phones and clothes travel with you. */
const HOME_CATEGORIES: ReadonlySet<ItemCategory> = new Set(['furniture', 'appliances', 'electronics', 'power', 'computers', 'essentials']);

/**
 * Shop in the simulation: starter kit for newborn characters, capability tags for actions, online deliveries at
 * day end, belongings in net worth and status (clothes worn + luxury gadgets).
 */
@Injectable()
export class ShopSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'shop';
  readonly order = 110;

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly lifeEvents: LifeEventsRegistry,
    private readonly inventory: InventoryService,
    private readonly shop: ShopService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
    this.lifeEvents.register(...shopLifeEvents(this.inventory));
  }

  async onCharacterCreated(ctx: SimulationContext): Promise<void> {
    for (const itemId of [...starterWardrobeFor(ctx.character.gender), ...STARTER_ITEMS]) {
      const product = findProduct(itemId);
      if (product) await this.inventory.add(ctx, product, 1, 'starter', 0);
    }
    ctx.character.outfit = starterOutfit(ctx.character.gender);
  }

  async itemTags(ctx: SimulationContext): Promise<readonly string[]> {
    return this.inventory.tags(ctx);
  }

  async onDayEnd(ctx: SimulationContext): Promise<void> {
    await this.shop.deliverDue(ctx);
  }

  async netWorth(ctx: SimulationContext): Promise<number> {
    return this.inventory.resaleValue(ctx);
  }

  async summarize(ctx: SimulationContext): Promise<SummaryContribution> {
    const homeItems = new Set<string>();
    for (const { itemId } of await this.inventory.owned(ctx)) {
      const product = findProduct(itemId);
      if (product?.kind === 'item' && HOME_CATEGORIES.has(product.def.category)) homeItems.add(itemId);
    }
    return { homeItems: [...homeItems].toSorted() };
  }

  async status(ctx: SimulationContext): Promise<number> {
    return outfitStatus(ctx.character.outfit) + (await this.inventory.status(ctx));
  }
}
