import { Injectable } from '@nestjs/common';
import { LessThanOrEqual } from 'typeorm';
import {
  PANTRY_MAX_MEALS,
  findProduct,
  findVenue,
  isVenueOpen,
  listedProducts,
  outletSells,
  productCategory,
  shopOutletAt,
  toDateParts,
  venuesSelling,
  type InventoryDto,
  type ShopCatalogDto,
  type ShopOrderDto,
  type ShopProduct,
  type ShopProductDto,
  type ShopPurchaseResultDto,
  type ShopQuery,
  type ShopVenueDto,
} from '@insidelife/shared';
import { GameRuleException, InsufficientFundsException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { ShopOrderEntity } from './entities/shop-order.entity.js';
import { InventoryService } from './inventory.service.js';
import { deliveryArrival, inStoreVenue, onlineDeliveryFee, type ShopperPosition } from './rules/purchase.rules.js';

/**
 * Shopping: the catalogue (priced with the world price index), in-store purchases when standing in a venue that
 * sells the product, and online orders that a dispatch rider brings at day end for a 10% delivery fee.
 */
@Injectable()
export class ShopService {
  constructor(private readonly inventory: InventoryService) {}

  async catalogue(ctx: SimulationContext, query: ShopQuery): Promise<ShopCatalogDto> {
    if (query.venueId && !findVenue(query.venueId)) throw new ResourceNotFoundException('Venue');
    const position = this.position(ctx);
    const venueId = query.venueId ?? (findVenue(ctx.character.locationId) ? ctx.character.locationId : undefined);
    const filterOutlet = query.venueId ? shopOutletAt(query.venueId) : undefined;
    const counts = await this.ownedOrOnTheWay(ctx);

    const products: ShopProductDto[] = [];
    for (const product of listedProducts()) {
      if (query.category && productCategory(product) !== query.category) continue;
      if (filterOutlet !== undefined && !(filterOutlet && outletSells(filterOutlet, product))) continue;
      products.push(this.productDto(ctx, product, position, counts.get(product.def.id) ?? 0));
    }
    return { venue: venueId ? this.venueDto(ctx, venueId) : null, products };
  }

  /** Buy off the shelf if the character is in a venue that sells it, otherwise order online for delivery. */
  async purchase(ctx: SimulationContext, itemId: string, quantity = 1): Promise<ShopPurchaseResultDto> {
    if (!ctx.character.alive) throw new GameRuleException('DECEASED', 'This character has passed on');
    const product = findProduct(itemId);
    if (!product || (product.kind === 'item' && product.def.unlisted)) throw new ResourceNotFoundException('Product');
    await this.assertRoom(ctx, product, quantity);

    const venue = inStoreVenue(this.position(ctx), product);
    const unitPrice = ctx.world.price(product.def.price, ctx.time);
    const subtotal = unitPrice * quantity;
    const deliveryFee = venue ? 0 : onlineDeliveryFee(subtotal);
    const total = subtotal + deliveryFee;
    if (!ctx.wallet.canAfford(total)) throw new InsufficientFundsException(total);

    const order = await ctx.manager.save(
      ctx.manager.create(ShopOrderEntity, {
        characterId: ctx.character.id,
        itemId: product.def.id,
        kind: product.kind,
        quantity,
        unitPrice,
        deliveryFee,
        total,
        channel: venue ? 'in-store' : 'online',
        venueId: venue?.id ?? null,
        status: venue ? 'delivered' : 'pending',
        orderedAt: ctx.time,
        arrivesAt: venue ? null : deliveryArrival(ctx.time),
        deliveredAt: venue ? ctx.time : null,
      }),
    );

    const label = `${quantity > 1 ? `${quantity}× ` : ''}${product.def.name}`;
    const metadata = { orderId: order.id, itemId: product.def.id, quantity, channel: order.channel };
    await ctx.wallet.pay(subtotal, 'purchase', venue ? `${label} — ${venue.name}` : `${label} (online)`, `shop-order:${order.id}`, { metadata });
    if (deliveryFee > 0) {
      await ctx.wallet.pay(deliveryFee, 'fee', `Delivery: ${label}`, `shop-order:${order.id}:delivery`, { sink: 'fees', metadata });
    }

    const row = venue ? await this.inventory.add(ctx, product, quantity, 'store', unitPrice) : null;
    const stack = row ? (await this.inventory.stacks(ctx)).find((candidate) => candidate.row.id === row.id) : undefined;
    return {
      order: this.orderDto(order),
      inventoryItem: stack ? this.inventory.toDto(ctx, stack) : null,
      balance: ctx.wallet.cash,
    };
  }

  /** Hand over online orders whose delivery time has come (runs at day end). */
  async deliverDue(ctx: SimulationContext): Promise<void> {
    const due = await ctx.manager.find(ShopOrderEntity, {
      where: { characterId: ctx.character.id, status: 'pending', arrivesAt: LessThanOrEqual(ctx.time) },
      order: { orderedAt: 'ASC' },
    });
    if (due.length === 0) return;

    const delivered: Array<{ name: string; quantity: number }> = [];
    for (const order of due) {
      const product = findProduct(order.itemId);
      if (product) {
        await this.inventory.add(ctx, product, order.quantity, 'online', order.unitPrice);
        delivered.push({ name: product.def.name, quantity: order.quantity });
      }
      order.status = 'delivered';
      order.deliveredAt = ctx.time;
      await ctx.manager.save(order);
    }
    const list = InventoryService.describe(delivered);
    ctx.notify({ kind: 'system', title: 'Dispatch rider don land 📦', body: `Your order arrived: ${list}.`, tone: 'good' });
    ctx.report({ label: `Delivered: ${list}`, tone: 'good' });
  }

  async inventoryView(ctx: SimulationContext): Promise<InventoryDto> {
    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const stacks = await this.inventory.stacks(ctx);
    const deliveries = await this.pendingOrders(ctx);
    const home = await this.inventory.homeComfortBonus(ctx);
    const tags = await this.inventory.tags(ctx);
    return {
      items: stacks.map((stack) => this.inventory.toDto(ctx, stack)),
      deliveries: deliveries.map((order) => this.orderDto(order)),
      home,
      tags,
    };
  }

  orderDto(order: ShopOrderEntity): ShopOrderDto {
    return {
      id: order.id,
      itemId: order.itemId,
      name: findProduct(order.itemId)?.def.name ?? order.itemId,
      kind: order.kind,
      quantity: order.quantity,
      unitPrice: order.unitPrice,
      deliveryFee: order.deliveryFee,
      total: order.total,
      channel: order.channel,
      venueId: order.venueId,
      status: order.status,
      orderedAt: order.orderedAt,
      arrivesAt: order.arrivesAt,
    };
  }

  private async assertRoom(ctx: SimulationContext, product: ShopProduct, quantity: number): Promise<void> {
    if (product.kind === 'clothing' && quantity !== 1) {
      throw new GameRuleException('ONE_IS_ENOUGH', 'One of each piece of clothing is enough — buy something else');
    }
    if (product.kind === 'item' && product.def.meals) {
      const room = PANTRY_MAX_MEALS - ctx.character.pantryMeals;
      if (product.def.meals * quantity > room) {
        throw new GameRuleException('PANTRY_FULL', room < product.def.meals ? 'Your kitchen is full — cook some of it first' : `Your kitchen only has room for ${Math.floor(room / product.def.meals)} more`);
      }
      return;
    }
    const max = product.kind === 'item' ? product.def.maxQuantity : 1;
    const have = (await this.ownedOrOnTheWay(ctx)).get(product.def.id) ?? 0;
    if (have + quantity <= max) return;
    if (product.kind === 'clothing') {
      throw new GameRuleException('ALREADY_OWNED', `${product.def.name} is already in your wardrobe (or on its way)`);
    }
    const left = Math.max(0, max - have);
    throw new GameRuleException(
      'TOO_MANY',
      left === 0 ? `You already have ${max === 1 ? 'one' : `${max}`} ${product.def.name} — that's plenty` : `You can only get ${left} more ${product.def.name}`,
    );
  }

  private async ownedOrOnTheWay(ctx: SimulationContext): Promise<Map<string, number>> {
    const counts = new Map(await this.inventory.quantities(ctx));
    for (const order of await this.pendingOrders(ctx)) counts.set(order.itemId, (counts.get(order.itemId) ?? 0) + order.quantity);
    return counts;
  }

  private pendingOrders(ctx: SimulationContext): Promise<ShopOrderEntity[]> {
    return ctx.manager.find(ShopOrderEntity, {
      where: { characterId: ctx.character.id, status: 'pending' },
      order: { arrivesAt: 'ASC' },
    });
  }

  private productDto(ctx: SimulationContext, product: ShopProduct, position: ShopperPosition, owned: number): ShopProductDto {
    const price = ctx.world.price(product.def.price, ctx.time);
    return {
      id: product.def.id,
      kind: product.kind,
      name: product.def.name,
      category: productCategory(product),
      store: product.def.store,
      price,
      deliveryFee: onlineDeliveryFee(price),
      status: product.def.status,
      soldAt: venuesSelling(product),
      inStoreHere: inStoreVenue(position, product) !== null,
      owned,
      maxQuantity: product.kind === 'item' ? product.def.maxQuantity : 1,
      item: product.kind === 'item' ? product.def : null,
      clothing: product.kind === 'clothing' ? product.def : null,
    };
  }

  private venueDto(ctx: SimulationContext, venueId: string): ShopVenueDto | null {
    const venue = findVenue(venueId);
    if (!venue) return null;
    return {
      id: venue.id,
      name: venue.name,
      type: venue.type,
      label: shopOutletAt(venue.id)?.label ?? null,
      open: isVenueOpen(venue, toDateParts(ctx.time).hour),
      here: ctx.character.locationId === venue.id && !ctx.character.travel,
    };
  }

  private position(ctx: SimulationContext): ShopperPosition {
    return {
      locationId: ctx.character.locationId,
      travelling: ctx.character.travel !== null,
      hour: toDateParts(ctx.time).hour,
    };
  }
}
