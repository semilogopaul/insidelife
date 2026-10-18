import { Inject, Injectable } from '@nestjs/common';
import {
  DECOR_HOME_ROOMS,
  DECOR_ITEMS,
  DECOR_MAX_OWNED,
  DECOR_MAX_PER_PURCHASE,
  DECOR_MAX_PER_ROOM,
  FURNITURE_ITEMS,
  FURNITURE_SELL_BACK_RATE,
  aircraftDecorTemplateId,
  aircraftLocationId,
  aircraftRoomCap,
  checkAircraftDecorPlacement,
  checkDecorPlacement,
  decorPoseOf,
  decorRect,
  findAircraft,
  findAircraftDecorRoom,
  findDecorItem,
  findDecorRoom,
  findDecorVariant,
  findFurnitureSpec,
  formatNaira,
  furnitureDecorId,
  furnitureRoomIssue,
  furnitureWorth,
  homeFurnishing,
  homeKey,
  homeLocationId,
  isFurnitureProduct,
  isSmallPiece,
  placeInHome,
  recolourPrice,
  surfaceTop,
  type DecorAircraftDto,
  type DecorArrangeResultDto,
  type DecorChangeDto,
  type DecorHomeDto,
  type DecorItem,
  type DecorPieceDto,
  type DecorPlaceRequest,
  type DecorPlacedDto,
  type DecorPose,
  type DecorPurchaseRequest,
  type DecorPurchaseResultDto,
  type DecorRecolourResultDto,
  type DecorReplaceMode,
  type DecorReplaceResultDto,
  type DecorRoom,
  type DecorSellResultDto,
  type DecorStateDto,
  type FurnitureFn,
  type FurniturePurchaseDto,
  type PlacedDecor,
  type PlacementVerdict,
  type RoomedPiece,
} from '@insidelife/shared';
import { In, IsNull, Not, type FindOptionsWhere } from 'typeorm';
import type { AircraftDecorPort } from '../../common/ports/aircraft-decor.port.js';
import {
  ForbiddenActionException,
  GameRuleException,
  InsufficientFundsException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception.js';
import type { FurnitureHint, FurniturePort } from '../../common/ports/furniture.port.js';
import { HOME_ACCESS_PORT, type HomeAccessPort } from '../../common/ports/home-access.port.js';
import { HOUSEHOLD_PORT, type HomeTemplateInfo, type HouseholdPort } from '../../common/ports/household.port.js';
import { INVENTORY_PORT, type InventoryPort } from '../../common/ports/inventory.port.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { carriedPose } from './decor.rules.js';
import { DecorPieceEntity } from './entities/decor-piece.entity.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where a piece is being put: a room of a home or of an aircraft, and how that place validates and records it. */
interface PlaceTarget {
  readonly room: DecorRoom;
  readonly cap: number;
  /** The pieces already in that room. */
  readonly scope: FindOptionsWhere<DecorPieceEntity>;
  readonly isHere: (row: DecorPieceEntity) => boolean;
  readonly apply: (row: DecorPieceEntity, pose: DecorPose) => void;
  readonly check: (item: DecorItem, pose: DecorPose, others: readonly PlacedDecor[]) => PlacementVerdict;
}

/** The home the character lives in, as furniture needs it. */
interface HomeInfo extends HomeTemplateInfo {
  readonly key: string;
  /** The family house and hostels come furnished: their furniture stays, and your own pieces there are small ones. */
  readonly provided: boolean;
  readonly roomIds: readonly string[];
}

const FAMILY_FURNITURE =
  'The family’s furniture stays where it is — your own beds, sofas and tables are for a place of your own. Small things are yours to arrange.';

/** Functions where buying a better one offers to replace the old (a bed, a sofa, a TV). */
const REPLACEABLE: ReadonlySet<FurnitureFn> = new Set<FurnitureFn>(['sleep', 'sit', 'tv']);

const RECONCILE_KEY = 'furniture-reconcile';

const worthOf = (row: DecorPieceEntity): number => {
  const item = findDecorItem(row.itemId);
  return item ? furnitureWorth(item) : 0;
};

/**
 * Furniture and decor: one set of pieces. Buying decor is charged here (through the ledger); furniture is bought in the
 * shop and arrives here as pieces (`FurniturePort`) that are put in the home at once. The server validates every
 * placement (`checkDecorPlacement`: room bounds, doors, stairs, windows, fittings, overlap, surfaces, and that a bed
 * goes in a bedroom), caps rooms and collections, sells pieces back, and says which furniture is actually in the home
 * (so the best bed placed there sets how well you sleep). It shows a home's pieces to its visitors.
 */
@Injectable()
export class DecorService implements AircraftDecorPort, FurniturePort {
  constructor(
    @Inject(HOUSEHOLD_PORT) private readonly household: HouseholdPort,
    @Inject(HOME_ACCESS_PORT) private readonly access: HomeAccessPort,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
  ) {}

  async state(ctx: SimulationContext): Promise<DecorStateDto> {
    await this.reconcile(ctx);
    const info = await this.homeInfo(ctx);
    const pieces = await ctx.manager.find(DecorPieceEntity, { where: { characterId: ctx.character.id }, order: { createdAt: 'ASC', id: 'ASC' } });
    const prices: Record<string, number> = {};
    const recolourPrices: Record<string, number> = {};
    for (const item of DECOR_ITEMS) {
      prices[item.id] = this.unitPrice(ctx, item.price);
      recolourPrices[item.id] = this.unitPrice(ctx, recolourPrice(item.price));
    }
    const sellBacks: Record<string, number> = {};
    for (const piece of pieces) sellBacks[piece.id] = await this.sellBackOf(ctx, piece);
    // Furniture is priced by the shop (the world price index applies); re-finishing it costs the same share.
    for (const item of FURNITURE_ITEMS) {
      prices[item.id] = this.unitPrice(ctx, item.price);
      recolourPrices[item.id] = this.unitPrice(ctx, recolourPrice(item.price));
    }
    const furnishing = homeFurnishing(info.templateId, this.roomedPieces(info, pieces));
    return {
      pieces: pieces.map((piece) => this.toDto(ctx, piece)),
      prices,
      recolourPrices,
      home: { eligible: true, reason: null, scope: info.provided ? 'small' : 'full', templateId: info.templateId, ownership: info.ownership },
      limits: { perRoom: DECOR_MAX_PER_ROOM, owned: DECOR_MAX_OWNED },
      sellBacks,
      furnishing,
      bedQuality: (await this.inventory.homeComfortBonus(ctx)).bedQuality,
    };
  }

  async purchase(ctx: SimulationContext, itemId: string, variantId: string, quantity = 1, place?: DecorPurchaseRequest['place']): Promise<DecorPurchaseResultDto> {
    if (!ctx.character.alive) throw new GameRuleException('DECEASED', 'This character has passed on');
    const item = findDecorItem(itemId);
    if (!item) throw new ResourceNotFoundException('Decor item');
    if (item.shopItemId) throw new GameRuleException('SOLD_IN_SHOP', `${item.name} is sold in the furniture store, not the Decor store.`);
    const variant = findDecorVariant(item, variantId);
    if (!variant) throw new GameRuleException('NO_SUCH_VARIANT', `${item.name} doesn’t come in that finish.`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > DECOR_MAX_PER_PURCHASE) {
      throw new GameRuleException('BAD_QUANTITY', `Buy between 1 and ${DECOR_MAX_PER_PURCHASE} at a time.`);
    }
    const owned = await ctx.manager.count(DecorPieceEntity, { where: { characterId: ctx.character.id } });
    if (owned + quantity > DECOR_MAX_OWNED) {
      throw new GameRuleException('TOO_MUCH_DECOR', `You already own ${owned} decor pieces — that’s a lot to look after. Sell or give some away first.`);
    }
    const unitPrice = this.unitPrice(ctx, item.price);
    const total = unitPrice * quantity;
    if (!ctx.wallet.canAfford(total)) throw new InsufficientFundsException(total);

    const rows = await ctx.manager.save(
      Array.from({ length: quantity }, () =>
        ctx.manager.create(DecorPieceEntity, {
          characterId: ctx.character.id,
          itemId: item.id,
          variant: variant.id,
          pricePaid: unitPrice,
          boughtAt: ctx.time,
          recolours: 0,
          aircraftId: null,
          homeKey: null,
          templateId: null,
          roomId: null,
          x: 0,
          y: 0,
          z: 0,
          rot: 0,
          wall: null,
          onId: null,
          inventoryItemId: null,
          settled: true,
        }),
      ),
    );
    const label = `${quantity > 1 ? `${quantity}× ` : ''}${item.name} (${variant.label})`;
    await ctx.wallet.pay(total, 'purchase', `Home decor: ${label}`, `decor-buy:${rows[0]!.id}`, {
      metadata: { itemId: item.id, variant: variant.id, quantity, firstPieceId: rows[0]!.id },
    });
    // Straight into the room you are in, when you said which and it is the home you live in.
    if (place) {
      const info = await this.homeInfo(ctx);
      if (place.templateId === info.templateId) await this.putInHome(ctx, info, rows, { preferred: place.roomId });
    }
    ctx.notify({ kind: 'system', title: 'Decor delivered', body: `${label} is ${rows.every((row) => row.templateId) ? 'in your home' : 'in your decor inventory'}. Paid ${formatNaira(total)}.`, tone: 'good', amount: -total });
    return { pieces: rows.map((row) => this.toDto(ctx, row)), unitPrice, total, balance: ctx.wallet.cash };
  }

  /** Put an inventory piece down, or move/turn one that's placed. A moved table takes what's on it along. */
  async place(ctx: SimulationContext, pieceId: string, request: DecorPlaceRequest): Promise<DecorChangeDto> {
    const piece = await this.own(ctx, pieceId);
    const info = await this.homeInfo(ctx);
    const item = findDecorItem(piece.itemId);
    if (!item) throw new ResourceNotFoundException('Decor item');
    if (info.provided && !isSmallPiece(item)) throw new GameRuleException('FAMILY_FURNITURE', FAMILY_FURNITURE);
    const room = findDecorRoom(request.templateId, request.roomId, info.provided);
    if (!room) throw new GameRuleException('NO_SUCH_ROOM', 'You can’t decorate that room.');
    const issue = furnitureRoomIssue(request.templateId, request.roomId, item);
    if (issue) throw new GameRuleException('WRONG_ROOM', issue);
    const key = info.key;
    return this.settle(ctx, piece, request, {
      room,
      cap: DECOR_MAX_PER_ROOM,
      scope: { characterId: ctx.character.id, homeKey: key, templateId: request.templateId, roomId: request.roomId },
      isHere: (row) => row.homeKey === key && row.templateId === request.templateId && row.roomId === request.roomId,
      apply: (row, pose) => this.setSpot(row, key, request.templateId, request.roomId, pose),
      check: (checked, pose, others) => checkDecorPlacement(room, checked, pose, others),
    });
  }

  /**
   * Fit an inventory piece (or one from a home or another of your planes) in a room of one of your aircraft, or move
   * and turn one already there. The same rules as a home plus the cabin's: only pieces secured for flight, beds in a
   * suite, a bare flight deck, a lower ceiling and fewer pieces per room. Owner only.
   */
  async placeInAircraft(ctx: SimulationContext, aircraftId: string, pieceId: string, request: DecorPlaceRequest): Promise<DecorChangeDto> {
    const plane = await this.ownedAircraft(ctx, aircraftId);
    const piece = await this.own(ctx, pieceId);
    if (request.templateId !== plane.templateId) throw new GameRuleException('NO_SUCH_ROOM', 'That isn’t this aircraft’s cabin.');
    const room = findAircraftDecorRoom(plane.templateId, request.roomId);
    if (!room) throw new GameRuleException('NO_SUCH_ROOM', 'This aircraft has no such room to decorate.');
    return this.settle(ctx, piece, request, {
      room,
      cap: aircraftRoomCap(request.roomId),
      scope: { characterId: ctx.character.id, aircraftId, templateId: plane.templateId, roomId: request.roomId },
      isHere: (row) => row.aircraftId === aircraftId && row.roomId === request.roomId,
      apply: (row, pose) => this.setAircraftSpot(row, aircraftId, plane.templateId, request.roomId, pose),
      check: (item, pose, others) => checkAircraftDecorPlacement(request.roomId, room, item, pose, others),
    });
  }

  /** The shared body of placing: caps, validation, moving what sits on a moved table, stranding what is left behind. */
  private async settle(ctx: SimulationContext, piece: DecorPieceEntity, request: DecorPlaceRequest, target: PlaceTarget): Promise<DecorChangeDto> {
    const item = findDecorItem(piece.itemId);
    if (!item) throw new ResourceNotFoundException('Decor item');
    const { room } = target;
    const inRoom = await ctx.manager.find(DecorPieceEntity, { where: target.scope });
    const here = target.isHere(piece);
    const children = here ? inRoom.filter((other) => other.onId === piece.id) : [];
    const others = inRoom.filter((other) => other.id !== piece.id && !children.includes(other));
    if (!here && inRoom.length >= target.cap) {
      throw new GameRuleException('ROOM_FULL', `This room is full (${target.cap} pieces). Put something back first.`);
    }

    const verdict = target.check(
      item,
      {
        x: request.x,
        z: request.z,
        y: request.y ?? 0,
        rot: request.rot,
        wall: request.wall ?? null,
        onId: request.onId ?? null,
      },
      this.placedOf(others),
    );
    if (!verdict.ok) throw new GameRuleException('CANT_PLACE_THERE', verdict.reason);
    if (verdict.pose.onId === piece.id) throw new GameRuleException('CANT_PLACE_THERE', 'A piece can’t sit on itself.');

    const from = here ? decorRect(room, item, decorPoseOf(piece)) : null;
    // Pieces that were sitting on it in another room (or another home) go back to the inventory.
    const stranded = !here
      ? await ctx.manager.find(DecorPieceEntity, { where: { characterId: ctx.character.id, onId: piece.id } })
      : [];
    target.apply(piece, verdict.pose);
    const changed: DecorPieceEntity[] = [piece];
    for (const child of stranded) {
      this.putAway(child);
      changed.push(child);
    }

    if (from && children.length > 0) {
      const to = decorRect(room, item, verdict.pose);
      const top = surfaceTop(item, verdict.pose);
      const settled: PlacedDecor[] = [...this.placedOf(others), { id: piece.id, itemId: piece.itemId, pose: verdict.pose }];
      for (const child of children) {
        const childItem = findDecorItem(child.itemId);
        const carried = childItem && top !== null ? target.check(childItem, carriedPose(from, to, decorPoseOf(child), top), settled) : null;
        if (carried?.ok) {
          target.apply(child, carried.pose);
          settled.push({ id: child.id, itemId: child.itemId, pose: carried.pose });
        } else {
          this.putAway(child);
        }
        changed.push(child);
      }
    }
    await ctx.manager.save(changed);
    this.furnitureChanged(ctx);
    return { pieces: changed.map((row) => this.toDto(ctx, row)) };
  }

  /** Back to the inventory (with everything that was sitting on it). Always allowed. */
  async putBack(ctx: SimulationContext, pieceId: string): Promise<DecorChangeDto> {
    const piece = await this.own(ctx, pieceId);
    const onIt = await ctx.manager.find(DecorPieceEntity, { where: { characterId: ctx.character.id, onId: piece.id } });
    const changed = [piece, ...onIt];
    for (const row of changed) this.putAway(row);
    await ctx.manager.save(changed);
    this.furnitureChanged(ctx);
    return { pieces: changed.map((row) => this.toDto(ctx, row)) };
  }

  /** Another finish for a piece you own, for a share of its price. */
  async recolour(ctx: SimulationContext, pieceId: string, variantId: string): Promise<DecorRecolourResultDto> {
    const piece = await this.own(ctx, pieceId);
    const item = findDecorItem(piece.itemId);
    if (!item) throw new ResourceNotFoundException('Decor item');
    const variant = findDecorVariant(item, variantId);
    if (!variant) throw new GameRuleException('NO_SUCH_VARIANT', `${item.name} doesn’t come in that finish.`);
    if (variant.id === piece.variant) throw new GameRuleException('NOTHING_TO_CHANGE', 'It already looks like that.');
    const price = this.unitPrice(ctx, recolourPrice(item.price));
    await ctx.wallet.pay(price, 'purchase', `Re-finishing the ${item.name.toLowerCase()} (${variant.label})`, `decor-recolour:${piece.id}:${piece.recolours + 1}`, {
      metadata: { pieceId: piece.id, itemId: item.id, variant: variant.id },
    });
    piece.variant = variant.id;
    piece.recolours += 1;
    await ctx.manager.save(piece);
    return { piece: this.toDto(ctx, piece), price, balance: ctx.wallet.cash };
  }

  /**
   * Sell a piece back to the furniture store: a share of its price (`FURNITURE_SELL_BACK_RATE`; furniture is valued at
   * today's shelf price less wear, decor at what was paid), credited through the ledger as `furniture-sell:<piece>`.
   * What was sitting on it goes back to the inventory.
   */
  async sell(ctx: SimulationContext, pieceId: string): Promise<DecorSellResultDto> {
    const piece = await this.own(ctx, pieceId);
    const item = findDecorItem(piece.itemId);
    if (!item) throw new ResourceNotFoundException('Decor item');
    const onIt = await ctx.manager.find(DecorPieceEntity, { where: { characterId: ctx.character.id, onId: piece.id } });
    for (const child of onIt) this.putAway(child);
    if (onIt.length > 0) await ctx.manager.save(onIt);
    const amount = await this.pay(ctx, piece, item);
    await ctx.manager.delete(DecorPieceEntity, { id: piece.id });
    this.furnitureChanged(ctx);
    return { pieceId, amount, balance: ctx.wallet.cash, changed: onIt.map((row) => this.toDto(ctx, row)) };
  }

  /** Pay out for a piece being sold (furniture also gives up its unit in the shop's stack). */
  private async pay(ctx: SimulationContext, piece: DecorPieceEntity, item: DecorItem): Promise<number> {
    if (piece.inventoryItemId) return this.inventory.sellFurnitureUnit(ctx, piece.inventoryItemId, piece.id, FURNITURE_SELL_BACK_RATE);
    const amount = Math.round(piece.pricePaid * FURNITURE_SELL_BACK_RATE);
    if (amount > 0) {
      await ctx.wallet.receive(amount, 'refund', `Sold back: ${item.name}`, `furniture-sell:${piece.id}`, {
        income: 'neutral',
        metadata: { pieceId: piece.id, itemId: item.id },
      });
    }
    return amount;
  }

  /**
   * A new piece takes an older one's place: the old is stored or sold back. The new piece (already in the home, or in
   * the inventory) stands where the old one stood when it fits there.
   */
  async replace(ctx: SimulationContext, newId: string, oldId: string, mode: DecorReplaceMode): Promise<DecorReplaceResultDto> {
    if (newId === oldId) throw new GameRuleException('NOTHING_TO_CHANGE', 'That is the same piece.');
    const fresh = await this.own(ctx, newId);
    const old = await this.own(ctx, oldId);
    const freshItem = findDecorItem(fresh.itemId);
    const oldItem = findDecorItem(old.itemId);
    if (!freshItem || !oldItem) throw new ResourceNotFoundException('Decor item');
    const info = await this.homeInfo(ctx);
    const changed: DecorPieceEntity[] = [];
    const inHome = old.homeKey === info.key && old.templateId === info.templateId && old.roomId !== null;
    if (inHome && !info.provided) {
      const room = findDecorRoom(info.templateId, old.roomId!, false);
      const others = (await ctx.manager.find(DecorPieceEntity, { where: { characterId: ctx.character.id, homeKey: info.key, templateId: info.templateId, roomId: old.roomId! } })).filter(
        (row) => row.id !== old.id && row.id !== fresh.id && row.onId !== old.id,
      );
      const verdict = room ? checkDecorPlacement(room, freshItem, decorPoseOf(old), this.placedOf(others)) : null;
      if (verdict?.ok && !furnitureRoomIssue(info.templateId, old.roomId!, freshItem)) {
        this.setSpot(fresh, info.key, info.templateId, old.roomId!, verdict.pose);
        changed.push(fresh);
      }
    }
    // What sat on the old piece goes back to the inventory with it.
    const onOld = await ctx.manager.find(DecorPieceEntity, { where: { characterId: ctx.character.id, onId: old.id } });
    for (const child of onOld) this.putAway(child);
    changed.push(...onOld);
    let amount = 0;
    let soldId: string | null = null;
    if (mode === 'sell') {
      amount = await this.pay(ctx, old, oldItem);
      soldId = old.id;
    } else {
      this.putAway(old);
      changed.push(old);
    }
    if (changed.length > 0) await ctx.manager.save(changed.filter((row) => row.id !== soldId));
    if (soldId) await ctx.manager.delete(DecorPieceEntity, { id: soldId });
    this.furnitureChanged(ctx);
    return { pieces: changed.filter((row) => row.id !== soldId).map((row) => this.toDto(ctx, row)), amount, balance: ctx.wallet.cash, soldId };
  }

  /** Put every piece that isn't standing in your home into it, at good spots (floor furniture first, then walls, then tables). */
  async arrange(ctx: SimulationContext, roomId?: string): Promise<DecorArrangeResultDto> {
    await this.reconcile(ctx);
    const info = await this.homeInfo(ctx);
    const rows = await ctx.manager.find(DecorPieceEntity, { where: { characterId: ctx.character.id, aircraftId: IsNull() }, order: { createdAt: 'ASC', id: 'ASC' } });
    const loose = rows.filter((row) => !(row.homeKey === info.key && row.templateId === info.templateId));
    const eligible = loose.filter((row) => {
      const item = findDecorItem(row.itemId);
      return item !== undefined && (!info.provided || isSmallPiece(item));
    });
    const order = (row: DecorPieceEntity): number => {
      const item = findDecorItem(row.itemId)!;
      return (item.placement === 'floor' ? 0 : item.placement === 'wall' ? 1 : 2) * 1e12 - (item.fn ? 1e11 : 0) - furnitureWorth(item);
    };
    eligible.sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id));
    const left = await this.putInHome(ctx, info, eligible, { preferred: roomId ?? null });
    return { pieces: eligible.map((row) => this.toDto(ctx, row)), left };
  }

  /** What stands in a host's home, for the host and for guests inside or invited. */
  async homeView(ctx: SimulationContext, hostId: string): Promise<DecorHomeDto> {
    const me = ctx.character;
    if (me.id !== hostId && me.locationId !== homeLocationId(hostId) && !(await this.access.invitedDoor(ctx, hostId))) {
      throw new ForbiddenActionException('You’re not invited into that home.');
    }
    if (me.id === hostId) await this.reconcile(ctx);
    const key = me.id === hostId ? this.homeKeyOf(ctx) : await this.hostHomeKey(ctx, hostId);
    if (!key) throw new ResourceNotFoundException('Home');
    const rows = await ctx.manager.find(DecorPieceEntity, { where: { characterId: hostId, homeKey: key }, order: { createdAt: 'ASC', id: 'ASC' } });
    const placed: DecorPlacedDto[] = [];
    for (const row of rows) {
      if (!row.templateId || !row.roomId) continue;
      placed.push({ id: row.id, itemId: row.itemId, variant: row.variant, spot: this.spotOf(row)! });
    }
    return { hostId, placed };
  }

  /**
   * What is fitted in an aircraft's cabin: for its owner and for whoever is aboard (their location is the aircraft's,
   * `aircraftLocationId`). The pieces are the owner's; passengers only see them.
   */
  async aircraftView(ctx: SimulationContext, aircraftId: string): Promise<DecorAircraftDto> {
    const plane = await this.aircraftRow(ctx, aircraftId);
    if (!plane) throw new ResourceNotFoundException('Aircraft');
    if (plane.ownerId !== ctx.character.id && ctx.character.locationId !== aircraftLocationId(aircraftId)) {
      throw new ForbiddenActionException('You’re not aboard that aircraft.');
    }
    const rows = await ctx.manager.find(DecorPieceEntity, { where: { characterId: plane.ownerId, aircraftId }, order: { createdAt: 'ASC', id: 'ASC' } });
    const placed: DecorPlacedDto[] = [];
    for (const row of rows) {
      if (!row.templateId || !row.roomId) continue;
      placed.push({ id: row.id, itemId: row.itemId, variant: row.variant, spot: this.spotOf(row)! });
    }
    return { aircraftId, aircraftClass: plane.aircraftClass, ownerId: plane.ownerId, placed };
  }

  /** The aircraft is leaving its owner (sold): everything fitted in it goes back to their decor inventory. */
  async releaseAircraft(ctx: SimulationContext, aircraftId: string): Promise<number> {
    const rows = await ctx.manager.find(DecorPieceEntity, { where: { characterId: ctx.character.id, aircraftId } });
    for (const row of rows) this.putAway(row);
    if (rows.length > 0) await ctx.manager.save(rows);
    return rows.length;
  }

  // ----- FurniturePort -----------------------------------------------------------------------------------------------

  async acquired(ctx: SimulationContext, _stack: { readonly id: string; readonly itemId: string }, _units: number, hint: FurnitureHint = {}): Promise<FurniturePurchaseDto> {
    ctx.invalidate(RECONCILE_KEY);
    const created = await this.reconcile(ctx, { fresh: true, preferred: hint.roomId ?? null });
    const info = await this.homeInfo(ctx);
    const first = created[0] ? findDecorItem(created[0].itemId) : undefined;
    const replaces: DecorPieceEntity[] = [];
    if (first?.fn && REPLACEABLE.has(first.fn) && !info.provided) {
      const inHome = await ctx.manager.find(DecorPieceEntity, { where: { characterId: ctx.character.id, homeKey: info.key, templateId: info.templateId } });
      const ids = new Set(created.map((row) => row.id));
      for (const row of inHome) {
        const other = findDecorItem(row.itemId);
        if (!ids.has(row.id) && other?.fn === first.fn && furnitureWorth(other) < furnitureWorth(first)) replaces.push(row);
      }
    }
    const sellBacks: Record<string, number> = {};
    for (const row of replaces) sellBacks[row.id] = await this.sellBackOf(ctx, row);
    return { pieces: created.map((row) => this.toDto(ctx, row)), replaces: replaces.map((row) => this.toDto(ctx, row)), sellBacks };
  }

  async released(ctx: SimulationContext, stackId: string, units: number): Promise<void> {
    const rows = await ctx.manager.find(DecorPieceEntity, { where: { characterId: ctx.character.id, inventoryItemId: stackId }, order: { createdAt: 'DESC', id: 'DESC' } });
    // Stored pieces go first, then the ones standing in rooms.
    const doomed = rows.toSorted((a, b) => Number(a.templateId !== null) - Number(b.templateId !== null)).slice(0, units);
    await this.dropRows(ctx, doomed);
  }

  async countedStacks(ctx: SimulationContext): Promise<ReadonlySet<string> | null> {
    const info = await this.homeInfo(ctx);
    if (info.provided) return null;
    // Asked on every comfort and tag lookup: once per change is plenty.
    return ctx.memo(`${RECONCILE_KEY}:counted:${info.key}:${info.templateId}`, async () => {
      const stacks = (await this.inventory.owned(ctx)).filter((stack) => isFurnitureProduct(stack.itemId));
      if (stacks.length === 0) return new Set<string>();
      await this.reconcile(ctx);
      const rows = await ctx.manager.find(DecorPieceEntity, {
        where: { characterId: ctx.character.id, homeKey: info.key, templateId: info.templateId, inventoryItemId: Not(IsNull()) },
      });
      const counted = new Set<string>();
      for (const row of rows) if (row.inventoryItemId && row.roomId && row.onId === null) counted.add(row.inventoryItemId);
      return counted;
    });
  }

  async decorBedQuality(ctx: SimulationContext): Promise<number | null> {
    const info = await this.homeInfo(ctx);
    if (info.provided) return null;
    const rows = await ctx.manager.find(DecorPieceEntity, { where: { characterId: ctx.character.id, homeKey: info.key, templateId: info.templateId, inventoryItemId: IsNull() } });
    const beds = rows.filter((row) => findDecorItem(row.itemId)?.fn === 'sleep');
    return homeFurnishing(info.templateId, this.roomedPieces(info, beds)).sleep?.quality ?? null;
  }

  // ----- Furniture bookkeeping ---------------------------------------------------------------------------------------

  /**
   * Keep furniture and the shop's stacks one to one, and furniture in the home you live in. For every unit in a
   * furniture stack there is a piece: missing ones are made (put in the home where they fit — `fresh` ones where the
   * player is, long-owned ones where their template slot used to be); extras and orphans go. Pieces that were never
   * settled, or stand in another home, are put in this one when it is a home you can furnish. Safe to call often.
   */
  private reconcile(ctx: SimulationContext, options: { readonly fresh?: boolean; readonly preferred?: string | null } = {}): Promise<readonly DecorPieceEntity[]> {
    return this.homeInfo(ctx).then((info) => {
      const run = (): Promise<readonly DecorPieceEntity[]> => this.doReconcile(ctx, info, options);
      return options.fresh ? run() : ctx.memo(`${RECONCILE_KEY}:${info.key}:${info.templateId}`, run);
    });
  }

  private async doReconcile(ctx: SimulationContext, info: HomeInfo, options: { readonly fresh?: boolean; readonly preferred?: string | null }): Promise<readonly DecorPieceEntity[]> {
    const stacks = (await this.inventory.owned(ctx)).filter((stack) => isFurnitureProduct(stack.itemId));
    if (stacks.length === 0) return [];
    const linked = await ctx.manager.find(DecorPieceEntity, {
      where: { characterId: ctx.character.id, inventoryItemId: Not(IsNull()) },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const live = new Set(stacks.map((stack) => stack.id));
    const orphans = linked.filter((row) => !live.has(row.inventoryItemId!));
    const created: DecorPieceEntity[] = [];
    const doomed: DecorPieceEntity[] = [...orphans];
    for (const stack of stacks) {
      const mine = linked.filter((row) => row.inventoryItemId === stack.id);
      if (mine.length > stack.quantity) {
        doomed.push(...mine.toSorted((a, b) => Number(a.templateId !== null) - Number(b.templateId !== null)).slice(0, mine.length - stack.quantity));
      }
      const spec = findFurnitureSpec(stack.itemId);
      if (mine.length < stack.quantity && spec) {
        const item = findDecorItem(furnitureDecorId(stack.itemId))!;
        for (let i = mine.length; i < stack.quantity; i++) {
          created.push(
            ctx.manager.create(DecorPieceEntity, {
              characterId: ctx.character.id,
              itemId: item.id,
              variant: item.variants[0]!.id,
              pricePaid: 0,
              boughtAt: ctx.time,
              recolours: 0,
              aircraftId: null,
              homeKey: null,
              templateId: null,
              roomId: null,
              x: 0,
              y: 0,
              z: 0,
              rot: 0,
              wall: null,
              onId: null,
              inventoryItemId: stack.id,
              // A new purchase is put away on purpose when it finds no room; a long-owned stack is waiting to be settled.
              settled: options.fresh === true && !info.provided,
            }),
          );
        }
      }
    }
    if (doomed.length > 0) await this.dropRows(ctx, doomed);
    const doomedIds = new Set(doomed.map((row) => row.id));
    const alive = linked.filter((row) => !doomedIds.has(row.id));
    if (created.length > 0) await ctx.manager.save(created);
    if (info.provided) return options.fresh ? created : [];

    // Not settled yet, or standing in another home: put in this one. A fresh purchase goes where the player stands;
    // long-owned furniture goes where its template slot used to be.
    const pending = (row: DecorPieceEntity): boolean =>
      row.aircraftId === null && (!row.settled || (row.templateId !== null && (row.homeKey !== info.key || row.templateId !== info.templateId)));
    const arriving = options.fresh ? created : [];
    // The dearest first: of two beds in a home only one can have the template's bed spot, and it is the better one.
    const waiting = [...alive, ...(options.fresh ? [] : created)].filter(pending).toSorted((a, b) => worthOf(b) - worthOf(a) || a.id.localeCompare(b.id));
    if (waiting.length > 0) await this.putInHome(ctx, info, waiting, { legacy: true });
    if (arriving.length > 0) await this.putInHome(ctx, info, arriving, { preferred: options.preferred ?? null });
    return created;
  }

  /**
   * Put pieces in the home (each at a free valid spot of a room that suits it, best room first), save them, and report
   * how many found none (they are put away — in the inventory — on purpose). `legacy` first tries where the template's
   * own piece of the slot stood.
   */
  private async putInHome(ctx: SimulationContext, info: HomeInfo, rows: readonly DecorPieceEntity[], options: { readonly preferred?: string | null; readonly legacy?: boolean } = {}): Promise<number> {
    if (rows.length === 0) return 0;
    const inHome = await ctx.manager.find(DecorPieceEntity, { where: { characterId: ctx.character.id, homeKey: info.key, templateId: info.templateId } });
    const ids = new Set(rows.map((row) => row.id));
    const byRoom = new Map<string, PlacedDecor[]>();
    for (const row of inHome) {
      if (ids.has(row.id) || !row.roomId) continue;
      byRoom.set(row.roomId, [...(byRoom.get(row.roomId) ?? []), { id: row.id, itemId: row.itemId, pose: decorPoseOf(row) }]);
    }
    let left = 0;
    for (const row of rows) {
      const item = findDecorItem(row.itemId);
      const hit =
        item && (!info.provided || isSmallPiece(item))
          ? placeInHome(info.templateId, info.roomIds, item, (roomId) => byRoom.get(roomId) ?? [], {
              preferred: options.preferred,
              legacy: options.legacy,
              provided: info.provided,
              cap: DECOR_MAX_PER_ROOM,
            })
          : null;
      if (hit) {
        this.setSpot(row, info.key, info.templateId, hit.roomId, hit.pose);
        byRoom.set(hit.roomId, [...(byRoom.get(hit.roomId) ?? []), { id: row.id, itemId: row.itemId, pose: hit.pose }]);
      } else {
        this.putAway(row);
        left += 1;
      }
    }
    await ctx.manager.save([...rows]);
    this.furnitureChanged(ctx);
    return left;
  }

  /** Delete pieces (and put what sat on them back in the inventory). */
  private async dropRows(ctx: SimulationContext, rows: readonly DecorPieceEntity[]): Promise<void> {
    if (rows.length === 0) return;
    const ids = rows.map((row) => row.id);
    const onThem = await ctx.manager.find(DecorPieceEntity, { where: { characterId: ctx.character.id, onId: In(ids) } });
    const survivors = onThem.filter((row) => !ids.includes(row.id));
    for (const row of survivors) this.putAway(row);
    if (survivors.length > 0) await ctx.manager.save(survivors);
    await ctx.manager.delete(DecorPieceEntity, { id: In(ids) });
    this.furnitureChanged(ctx);
  }

  /** The best furniture is worked out from where pieces stand: anything that moves them clears what was memoised. */
  private furnitureChanged(ctx: SimulationContext): void {
    ctx.invalidate(RECONCILE_KEY);
    ctx.invalidate('shop-inventory');
    ctx.invalidate('item-tags');
  }

  // ----- Internals ---------------------------------------------------------------------------------------------

  private unitPrice(ctx: SimulationContext, base: number): number {
    return ctx.world.price(base, ctx.time);
  }

  private homeKeyOf(ctx: SimulationContext): string {
    return homeKey(ctx.character.id, ctx.character.homePropertyId);
  }

  private async homeInfo(ctx: SimulationContext): Promise<HomeInfo> {
    const template = await this.household.homeTemplate(ctx);
    return {
      ...template,
      key: this.homeKeyOf(ctx),
      provided: template.ownership === 'family' || template.ownership === 'hostel',
      roomIds: Object.keys(DECOR_HOME_ROOMS[template.templateId]),
    };
  }

  /** The pieces standing in the home as the furniture rules want them (a room each). */
  private roomedPieces(info: HomeInfo, rows: readonly DecorPieceEntity[]): RoomedPiece[] {
    return rows
      .filter((row) => row.homeKey === info.key && row.templateId === info.templateId && row.roomId !== null && row.aircraftId === null)
      .map((row) => ({ id: row.id, itemId: row.itemId, roomId: row.roomId!, pose: decorPoseOf(row) }));
  }

  private async sellBackOf(ctx: SimulationContext, row: DecorPieceEntity): Promise<number> {
    if (row.inventoryItemId) return this.inventory.furnitureSellBack(ctx, row.inventoryItemId, FURNITURE_SELL_BACK_RATE);
    return Math.round(row.pricePaid * FURNITURE_SELL_BACK_RATE);
  }

  private async hostHomeKey(ctx: SimulationContext, hostId: string): Promise<string | null> {
    const rows = await ctx.manager.query<Array<{ home_property_id: string | null }>>(
      'SELECT home_property_id FROM characters WHERE id = $1',
      [hostId],
    );
    return rows.length > 0 ? homeKey(hostId, rows[0]!.home_property_id) : null;
  }

  /** The aircraft row (the aviation module owns the table; the decor module only needs who owns it and its class). */
  private async aircraftRow(ctx: SimulationContext, aircraftId: string): Promise<{ ownerId: string; aircraftClass: string } | null> {
    if (!UUID.test(aircraftId)) return null;
    const rows = await ctx.manager.query<Array<{ character_id: string; aircraft_id: string }>>(
      'SELECT character_id, aircraft_id FROM aircraft WHERE id = $1',
      [aircraftId],
    );
    const def = rows.length > 0 ? findAircraft(rows[0]!.aircraft_id) : undefined;
    return def ? { ownerId: rows[0]!.character_id, aircraftClass: def.class } : null;
  }

  private async ownedAircraft(ctx: SimulationContext, aircraftId: string): Promise<{ templateId: string; aircraftClass: string }> {
    const plane = await this.aircraftRow(ctx, aircraftId);
    if (!plane || plane.ownerId !== ctx.character.id) throw new ResourceNotFoundException('Aircraft');
    return { templateId: aircraftDecorTemplateId(plane.aircraftClass), aircraftClass: plane.aircraftClass };
  }

  private async own(ctx: SimulationContext, pieceId: string): Promise<DecorPieceEntity> {
    const piece = await ctx.manager.findOne(DecorPieceEntity, { where: { id: pieceId, characterId: ctx.character.id } });
    if (!piece) throw new ResourceNotFoundException('Decor piece');
    return piece;
  }

  private placedOf(rows: readonly DecorPieceEntity[]): PlacedDecor[] {
    return rows.map((row) => ({ id: row.id, itemId: row.itemId, pose: decorPoseOf(row) }));
  }

  private setSpot(row: DecorPieceEntity, key: string, templateId: string, roomId: string, pose: DecorPose): void {
    row.aircraftId = null;
    row.homeKey = key;
    row.templateId = templateId;
    row.roomId = roomId;
    row.x = pose.x;
    row.y = pose.y;
    row.z = pose.z;
    row.rot = pose.rot;
    row.wall = pose.wall;
    row.onId = pose.onId;
    row.settled = true;
  }

  private setAircraftSpot(row: DecorPieceEntity, aircraftId: string, templateId: string, roomId: string, pose: DecorPose): void {
    this.setSpot(row, '', templateId, roomId, pose);
    row.homeKey = null;
    row.aircraftId = aircraftId;
  }

  private putAway(row: DecorPieceEntity): void {
    row.aircraftId = null;
    row.homeKey = null;
    row.templateId = null;
    row.roomId = null;
    row.x = 0;
    row.y = 0;
    row.z = 0;
    row.rot = 0;
    row.wall = null;
    row.onId = null;
    row.settled = true;
  }

  private spotOf(row: DecorPieceEntity): DecorPieceDto['spot'] {
    if (!row.templateId || !row.roomId) return null;
    return { templateId: row.templateId, roomId: row.roomId, x: row.x, z: row.z, y: row.y, rot: row.rot, wall: row.wall, onId: row.onId };
  }

  /** A piece is shown placed only while you still live in the home it was put in (or while it is fitted in a plane). */
  private toDto(ctx: SimulationContext, row: DecorPieceEntity): DecorPieceDto {
    const here = row.homeKey === this.homeKeyOf(ctx);
    const base = { id: row.id, itemId: row.itemId, variant: row.variant, recolours: row.recolours };
    if (row.aircraftId) return { ...base, spot: this.spotOf(row), aircraftId: row.aircraftId };
    return { ...base, spot: here ? this.spotOf(row) : null };
  }
}
