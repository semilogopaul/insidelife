import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  PANTRY_MAX_MEALS,
  FAULTY_CONDITION,
  MINUTES_PER_DAY,
  findProduct,
  isFurnitureProduct,
  productCategory,
  type FurniturePurchaseDto,
  type InventoryItemDto,
  type InventorySaleResultDto,
  type InventorySource,
  type ItemDefinition,
  type ShopProduct,
} from '@insidelife/shared';
import { GameRuleException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { FURNITURE_PORT, type FurnitureHint, type FurniturePort } from '../../common/ports/furniture.port.js';
import type { HomeComfortBonus, InventoryPort, OwnedItem } from '../../common/ports/inventory.port.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { InventoryItemEntity } from './entities/inventory-item.entity.js';
import {
  aggregateHomeComfort,
  belongingsStatus,
  capabilityTags,
  type OwnedForComfort,
} from './rules/home-comfort.rules.js';
import { wornItemIds } from './rules/outfit.rules.js';
import { conditionNow, expectedResaleValue, itemRepairCost, resaleOffer } from './rules/purchase.rules.js';

/** Memo key for the character's inventory rows (invalidate after every change). */
export const INVENTORY_MEMO = 'shop-inventory';
/** The planner's memo of item tags across all systems. */
const ITEM_TAGS_MEMO = 'item-tags';
/** Sources that hand over an asset for free (the value is recorded as unearned). */
const FREE_SOURCES: ReadonlySet<InventorySource> = new Set<InventorySource>(['starter', 'gift']);

/** An owned stack resolved against the catalog. */
export interface OwnedStack {
  readonly row: InventoryItemEntity;
  readonly product: ShopProduct;
}

/**
 * The character's belongings: loading, granting, removing, condition, resale and repair — and the `InventoryPort`
 * other domains use (home comfort for housing, `hasTag('mosquito-net')` for health, `takeByTag('phone')` for events).
 */
@Injectable()
export class InventoryService implements InventoryPort {
  private readonly logger = new Logger(InventoryService.name);
  /** The decor module's side of furniture, found on first use (the shop doesn't import it: housing consumes the shop). */
  private furniture: FurniturePort | null | undefined;
  /** What the furniture just added to the inventory did in this transaction (new pieces, what they could replace). */
  private readonly arrivals = new WeakMap<SimulationContext, FurniturePurchaseDto>();

  constructor(private readonly moduleRef: ModuleRef) {}

  private furniturePort(): FurniturePort | null {
    if (this.furniture === undefined) {
      try {
        this.furniture = this.moduleRef.get<FurniturePort>(FURNITURE_PORT, { strict: false });
      } catch {
        // No decor module in this app (a unit test): furniture is plain belongings.
        this.furniture = null;
      }
    }
    return this.furniture;
  }

  /** The pieces the last purchase of furniture created in this transaction, once. */
  takeArrival(ctx: SimulationContext): FurniturePurchaseDto | null {
    const arrival = this.arrivals.get(ctx) ?? null;
    this.arrivals.delete(ctx);
    return arrival;
  }

  // ----- InventoryPort ---------------------------------------------------------------------------------------------

  async homeComfortBonus(ctx: SimulationContext): Promise<HomeComfortBonus> {
    return aggregateHomeComfort(await this.workingItems(ctx), await this.furniturePort()?.decorBedQuality(ctx));
  }

  async owned(ctx: SimulationContext): Promise<readonly OwnedItem[]> {
    return (await this.stacks(ctx)).map(({ row }) => ({ id: row.id, itemId: row.itemId, quantity: row.quantity }));
  }

  async hasTag(ctx: SimulationContext, tag: string): Promise<boolean> {
    return (await this.tags(ctx)).includes(tag);
  }

  async grant(ctx: SimulationContext, itemId: string, quantity = 1): Promise<void> {
    const product = findProduct(itemId);
    if (!product) {
      this.logger.warn(`Tried to grant unknown item ${itemId}`);
      return;
    }
    await this.add(ctx, product, quantity, 'gift', 0);
  }

  async takeByTag(ctx: SimulationContext, tag: string): Promise<string | null> {
    const candidates = (await this.stacks(ctx))
      .filter((stack): stack is OwnedStack & { product: { kind: 'item'; def: ItemDefinition } } =>
        stack.product.kind === 'item' && stack.product.def.tags.includes(tag),
      )
      .toSorted((a, b) => b.product.def.price - a.product.def.price);
    const victim = candidates[0];
    if (!victim) return null;
    await this.remove(ctx, victim.row, 1);
    return victim.row.itemId;
  }

  // ----- Reads -----------------------------------------------------------------------------------------------------

  /** All owned stacks (memoised for the transaction). */
  async stacks(ctx: SimulationContext): Promise<readonly OwnedStack[]> {
    return ctx.memo(INVENTORY_MEMO, async () => {
      const rows = await ctx.manager.find(InventoryItemEntity, {
        where: { characterId: ctx.character.id },
        order: { acquiredAt: 'ASC' },
      });
      const stacks: OwnedStack[] = [];
      for (const row of rows) {
        const product = findProduct(row.itemId);
        if (product) stacks.push({ row, product });
        else this.logger.warn(`Inventory row ${row.id} references unknown item ${row.itemId}`);
      }
      return stacks;
    });
  }

  async find(ctx: SimulationContext, inventoryId: string): Promise<OwnedStack> {
    const stack = (await this.stacks(ctx)).find(({ row }) => row.id === inventoryId);
    if (!stack) throw new ResourceNotFoundException('Item');
    return stack;
  }

  /** Units owned per catalog id. */
  async quantities(ctx: SimulationContext): Promise<ReadonlyMap<string, number>> {
    const counts = new Map<string, number>();
    for (const { row } of await this.stacks(ctx)) counts.set(row.itemId, (counts.get(row.itemId) ?? 0) + row.quantity);
    return counts;
  }

  async ownedClothingIds(ctx: SimulationContext): Promise<ReadonlySet<string>> {
    return new Set((await this.stacks(ctx)).filter(({ product }) => product.kind === 'clothing').map(({ row }) => row.itemId));
  }

  /** Condition right now (clothing doesn't wear). */
  condition(ctx: SimulationContext, stack: OwnedStack): number {
    const wear = stack.product.kind === 'item' ? stack.product.def.wearPerDay : 0;
    return conditionNow(stack.row.condition, stack.row.conditionAt, ctx.time, wear);
  }

  async tags(ctx: SimulationContext): Promise<string[]> {
    return capabilityTags(await this.workingItems(ctx));
  }

  async status(ctx: SimulationContext): Promise<number> {
    return belongingsStatus(await this.workingItems(ctx));
  }

  /** Expected resale value of everything owned (for net worth). */
  async resaleValue(ctx: SimulationContext): Promise<number> {
    let total = 0;
    for (const stack of await this.stacks(ctx)) {
      const shelf = ctx.world.price(stack.product.def.price, ctx.time);
      total += expectedResaleValue(shelf, this.condition(ctx, stack)) * stack.row.quantity;
    }
    return total;
  }

  // ----- Writes ----------------------------------------------------------------------------------------------------

  /**
   * Add units to the character's inventory. Units of the same product stack (condition averages with the new
   * units); quantities are capped at the product's maximum and clothing at one.
   */
  async add(ctx: SimulationContext, product: ShopProduct, quantity: number, source: InventorySource, unitPrice: number, hint?: FurnitureHint): Promise<InventoryItemEntity | null> {
    // Groceries stock the kitchen (a meal count), they don't become belongings.
    if (product.kind === 'item' && product.def.meals) {
      ctx.character.pantryMeals = Math.min(PANTRY_MAX_MEALS, ctx.character.pantryMeals + product.def.meals * quantity);
      return null;
    }
    const max = product.kind === 'item' ? product.def.maxQuantity : 1;
    const existing = (await this.stacks(ctx)).find(({ row }) => row.itemId === product.def.id);
    const room = max - (existing?.row.quantity ?? 0);
    const units = Math.min(quantity, room);
    if (units <= 0) return existing?.row ?? null;

    let row: InventoryItemEntity;
    if (existing) {
      row = existing.row;
      const current = this.condition(ctx, existing);
      row.condition = (current * row.quantity + 100 * units) / (row.quantity + units);
      row.conditionAt = ctx.time;
      row.quantity += units;
      if (unitPrice > 0) row.unitPrice = unitPrice;
    } else {
      row = ctx.manager.create(InventoryItemEntity, {
        characterId: ctx.character.id,
        itemId: product.def.id,
        kind: product.kind,
        quantity: units,
        condition: 100,
        conditionAt: ctx.time,
        acquiredAt: ctx.time,
        source,
        unitPrice,
      });
    }
    await ctx.manager.save(row);
    this.changed(ctx);
    if (FREE_SOURCES.has(source)) {
      // Free assets count as unearned wealth at the value net worth gives them (keeps the self-made list honest).
      ctx.wallet.recordUnearnedAsset(expectedResaleValue(ctx.world.price(product.def.price, ctx.time), 100) * units);
    }
    // Furniture is a piece for every unit, put in the room you are in (or wherever it fits) at once.
    const port = product.kind === 'item' && isFurnitureProduct(product.def.id) ? this.furniturePort() : null;
    if (port) this.arrivals.set(ctx, await port.acquired(ctx, { id: row.id, itemId: row.itemId }, units, hint));
    return row;
  }

  async remove(ctx: SimulationContext, row: InventoryItemEntity, quantity: number, releasePieces = true): Promise<void> {
    const units = Math.min(quantity, row.quantity);
    if (quantity >= row.quantity) await ctx.manager.delete(InventoryItemEntity, { id: row.id });
    else {
      row.quantity -= quantity;
      await ctx.manager.save(row);
    }
    this.changed(ctx);
    // The furniture goes from the rooms too (a piece sold back from its room is released by the caller).
    if (releasePieces && isFurnitureProduct(row.itemId)) await this.furniturePort()?.released(ctx, row.id, units);
  }

  /** What a unit of furniture would fetch if sold back today: a share of the shelf price, less for worn pieces. */
  furnitureSellBack(ctx: SimulationContext, stackId: string, rate: number): Promise<number> {
    return this.find(ctx, stackId).then((stack) => this.furnitureOffer(ctx, stack, rate));
  }

  /** Sell one unit of furniture back to the store (the caller deletes its piece). Paid through the ledger, once per piece. */
  async sellFurnitureUnit(ctx: SimulationContext, stackId: string, pieceId: string, rate: number): Promise<number> {
    const stack = await this.find(ctx, stackId);
    const amount = this.furnitureOffer(ctx, stack, rate);
    await this.remove(ctx, stack.row, 1, false);
    if (amount > 0) {
      await ctx.wallet.receive(amount, 'refund', `Sold back ${stack.product.def.name}`, `furniture-sell:${pieceId}`, {
        income: 'neutral',
        metadata: { itemId: stack.row.itemId, pieceId },
      });
    }
    return amount;
  }

  private furnitureOffer(ctx: SimulationContext, stack: OwnedStack, rate: number): number {
    const shelf = ctx.world.price(stack.product.def.price, ctx.time);
    const wear = 0.5 + (0.5 * this.condition(ctx, stack)) / 100;
    return Math.round(shelf * rate * wear);
  }

  async setCondition(ctx: SimulationContext, row: InventoryItemEntity, condition: number): Promise<void> {
    row.condition = Math.max(0, Math.min(100, condition));
    row.conditionAt = ctx.time;
    await ctx.manager.save(row);
    this.changed(ctx);
  }

  /** Sell units to a second-hand buyer (30-60% of today's shelf price, less for worn items). */
  async sell(ctx: SimulationContext, inventoryId: string, quantity: number): Promise<InventorySaleResultDto> {
    const stack = await this.find(ctx, inventoryId);
    const { row, product } = stack;
    if (quantity > row.quantity) throw new GameRuleException('NOT_ENOUGH_UNITS', `You only have ${row.quantity} of ${product.def.name}`);
    if (product.kind === 'clothing' && wornItemIds(ctx.character.outfit).has(row.itemId)) {
      throw new GameRuleException('CURRENTLY_WORN', `You’re wearing ${product.def.name} — change clothes before selling it`);
    }

    const unit = this.offer(ctx, stack);
    const amount = unit * quantity;
    const key = `inventory-sale:${row.id}:${ctx.time}:${row.quantity}`;
    await this.remove(ctx, row, quantity);
    await ctx.wallet.receive(amount, 'refund', `Sold ${quantity > 1 ? `${quantity}× ` : ''}${product.def.name}`, key, {
      income: 'neutral',
      metadata: { itemId: row.itemId, quantity },
    });
    return { itemId: row.itemId, quantity, amount, balance: ctx.wallet.cash };
  }

  /** Call the repairman: restore an item to 100 condition. */
  async repair(ctx: SimulationContext, inventoryId: string): Promise<{ readonly stack: OwnedStack; readonly cost: number }> {
    const stack = await this.find(ctx, inventoryId);
    const cost = this.repairCost(ctx, stack);
    if (cost === null) throw new GameRuleException('NOTHING_TO_REPAIR', `${stack.product.def.name} doesn’t need any repairs`);
    await ctx.wallet.pay(cost, 'purchase', `Repair: ${stack.product.def.name}`, `inventory-repair:${stack.row.id}:${ctx.time}`);
    await this.setCondition(ctx, stack.row, 100);
    return { stack, cost };
  }

  // ----- Views -----------------------------------------------------------------------------------------------------

  toDto(ctx: SimulationContext, stack: OwnedStack): InventoryItemDto {
    const { row, product } = stack;
    const condition = this.condition(ctx, stack);
    return {
      id: row.id,
      itemId: row.itemId,
      kind: product.kind,
      name: product.def.name,
      category: productCategory(product),
      quantity: row.quantity,
      condition: Math.round(condition),
      faulty: product.kind === 'item' && condition < FAULTY_CONDITION,
      acquiredAt: row.acquiredAt,
      source: row.source,
      equipped: product.kind === 'clothing' && wornItemIds(ctx.character.outfit).has(row.itemId),
      resaleOffer: this.offer(ctx, stack),
      repairCost: this.repairCost(ctx, stack),
      item: product.kind === 'item' ? product.def : null,
      clothing: product.kind === 'clothing' ? product.def : null,
    };
  }

  // ----- Internals -------------------------------------------------------------------------------------------------

  /** Today's buyer offer for one unit (seeded per stack per day, so refreshing can't re-roll it). */
  private offer(ctx: SimulationContext, stack: OwnedStack): number {
    const shelf = ctx.world.price(stack.product.def.price, ctx.time);
    const roll = ctx.rng('resale', stack.row.id, Math.floor(ctx.time / MINUTES_PER_DAY)).next();
    return resaleOffer(shelf, this.condition(ctx, stack), roll);
  }

  private repairCost(ctx: SimulationContext, stack: OwnedStack): number | null {
    if (stack.product.kind !== 'item' || stack.product.def.wearPerDay <= 0) return null;
    return itemRepairCost(ctx.world.price(stack.product.def.price, ctx.time), this.condition(ctx, stack));
  }

  private async workingItems(ctx: SimulationContext): Promise<OwnedForComfort[]> {
    // Furniture counts where it stands: a bed in storage doesn't sleep you, a TV in a box doesn't show anything.
    const counted = await this.furniturePort()?.countedStacks(ctx);
    const items: OwnedForComfort[] = [];
    for (const stack of await this.stacks(ctx)) {
      if (stack.product.kind !== 'item') continue;
      if (counted && isFurnitureProduct(stack.row.itemId) && !counted.has(stack.row.id)) continue;
      items.push({ def: stack.product.def, condition: this.condition(ctx, stack) });
    }
    return items;
  }

  private changed(ctx: SimulationContext): void {
    ctx.invalidate(INVENTORY_MEMO);
    ctx.invalidate(ITEM_TAGS_MEMO);
  }

  /** Human list for notifications: "Tecno Spark and 2× Standing Fan". */
  static describe(entries: ReadonlyArray<{ readonly name: string; readonly quantity: number }>): string {
    const parts = entries.map(({ name, quantity }) => (quantity > 1 ? `${quantity}× ${name}` : name));
    return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  }
}
