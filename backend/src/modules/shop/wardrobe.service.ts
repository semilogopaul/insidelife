import { Injectable } from '@nestjs/common';
import type { Outfit, WardrobeDto } from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { InventoryService } from './inventory.service.js';
import { outfitStatus, validateOutfit, wornItemIds } from './rules/outfit.rules.js';
import { InvalidOutfitException } from './shop.exceptions.js';

/** The dressing room: owned clothing and the outfit the 3D avatar wears. */
@Injectable()
export class WardrobeService {
  constructor(private readonly inventory: InventoryService) {}

  async view(ctx: SimulationContext): Promise<WardrobeDto> {
    const worn = wornItemIds(ctx.character.outfit);
    const items = [];
    for (const { row, product } of await this.inventory.stacks(ctx)) {
      if (product.kind !== 'clothing') continue;
      items.push({ inventoryId: row.id, equipped: worn.has(row.itemId), clothing: product.def });
    }
    return { outfit: ctx.character.outfit, items, outfitStatus: outfitStatus(ctx.character.outfit) };
  }

  /** Validate against owned clothing (slot by slot, `full` overrides top + bottom) and dress the avatar. */
  async equip(ctx: SimulationContext, requested: Outfit): Promise<WardrobeDto> {
    const check = validateOutfit(requested, await this.inventory.ownedClothingIds(ctx));
    if (!check.ok) throw new InvalidOutfitException(check.errors);
    ctx.character.outfit = check.outfit;
    return this.view(ctx);
  }
}
