import { Inject, Injectable } from '@nestjs/common';
import {
  DECOR_ITEMS,
  DECOR_MAX_OWNED,
  DECOR_MAX_PER_PURCHASE,
  DECOR_MAX_PER_ROOM,
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
  formatNaira,
  homeKey,
  homeLocationId,
  recolourPrice,
  surfaceTop,
  type DecorAircraftDto,
  type DecorChangeDto,
  type DecorHomeDto,
  type DecorItem,
  type DecorRoom,
  type DecorPieceDto,
  type DecorPlaceRequest,
  type DecorPlacedDto,
  type DecorPose,
  type DecorPurchaseResultDto,
  type DecorRecolourResultDto,
  type DecorStateDto,
  type PlacedDecor,
  type PlacementVerdict,
} from '@insidelife/shared';
import type { FindOptionsWhere } from 'typeorm';
import type { AircraftDecorPort } from '../../common/ports/aircraft-decor.port.js';
import {
  ForbiddenActionException,
  GameRuleException,
  InsufficientFundsException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception.js';
import { HOME_ACCESS_PORT, type HomeAccessPort } from '../../common/ports/home-access.port.js';
import { HOUSEHOLD_PORT, type HouseholdPort } from '../../common/ports/household.port.js';
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

const NOT_YOUR_HOME = 'Decorating is for a home you rent or own — the family house and hostels stay as they are.';

/**
 * Interior decor: buying pieces (charged through the ledger) and placing them in the rooms of the home you rent or
 * own. The server validates every placement (`checkDecorPlacement`: room bounds, doors, stairs, windows, overlap,
 * surfaces), caps rooms and collections, and shows a home's pieces to its visitors.
 */
@Injectable()
export class DecorService implements AircraftDecorPort {
  constructor(
    @Inject(HOUSEHOLD_PORT) private readonly household: HouseholdPort,
    @Inject(HOME_ACCESS_PORT) private readonly access: HomeAccessPort,
  ) {}

  async state(ctx: SimulationContext): Promise<DecorStateDto> {
    const pieces = await ctx.manager.find(DecorPieceEntity, { where: { characterId: ctx.character.id }, order: { createdAt: 'ASC', id: 'ASC' } });
    const prices: Record<string, number> = {};
    const recolourPrices: Record<string, number> = {};
    for (const item of DECOR_ITEMS) {
      prices[item.id] = this.unitPrice(ctx, item.price);
      recolourPrices[item.id] = this.unitPrice(ctx, recolourPrice(item.price));
    }
    const home = await this.eligibility(ctx);
    return {
      pieces: pieces.map((piece) => this.toDto(ctx, piece, home.eligible)),
      prices,
      recolourPrices,
      home,
      limits: { perRoom: DECOR_MAX_PER_ROOM, owned: DECOR_MAX_OWNED },
    };
  }

  async purchase(ctx: SimulationContext, itemId: string, variantId: string, quantity = 1): Promise<DecorPurchaseResultDto> {
    if (!ctx.character.alive) throw new GameRuleException('DECEASED', 'This character has passed on');
    const item = findDecorItem(itemId);
    if (!item) throw new ResourceNotFoundException('Decor item');
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
        }),
      ),
    );
    const label = `${quantity > 1 ? `${quantity}× ` : ''}${item.name} (${variant.label})`;
    await ctx.wallet.pay(total, 'purchase', `Home decor: ${label}`, `decor-buy:${rows[0]!.id}`, {
      metadata: { itemId: item.id, variant: variant.id, quantity, firstPieceId: rows[0]!.id },
    });
    ctx.notify({ kind: 'system', title: 'Decor delivered', body: `${label} is in your decor inventory. Paid ${formatNaira(total)}.`, tone: 'good', amount: -total });
    return { pieces: rows.map((row) => this.toDto(ctx, row, true)), unitPrice, total, balance: ctx.wallet.cash };
  }

  /** Put an inventory piece down, or move/turn one that's placed. A moved table takes what's on it along. */
  async place(ctx: SimulationContext, pieceId: string, request: DecorPlaceRequest): Promise<DecorChangeDto> {
    const piece = await this.own(ctx, pieceId);
    const home = await this.eligibility(ctx);
    if (!home.eligible) throw new GameRuleException('NOT_YOUR_HOME', home.reason ?? NOT_YOUR_HOME);
    const room = findDecorRoom(request.templateId, request.roomId);
    if (!room) throw new GameRuleException('NO_SUCH_ROOM', 'You can’t decorate that room.');
    const key = this.homeKeyOf(ctx);
    return this.settle(ctx, piece, request, {
      room,
      cap: DECOR_MAX_PER_ROOM,
      scope: { characterId: ctx.character.id, homeKey: key, templateId: request.templateId, roomId: request.roomId },
      isHere: (row) => row.homeKey === key && row.templateId === request.templateId && row.roomId === request.roomId,
      apply: (row, pose) => this.setSpot(row, key, request.templateId, request.roomId, pose),
      check: (item, pose, others) => checkDecorPlacement(room, item, pose, others),
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
    return { pieces: changed.map((row) => this.toDto(ctx, row, true)) };
  }

  /** Back to the inventory (with everything that was sitting on it). Always allowed. */
  async putBack(ctx: SimulationContext, pieceId: string): Promise<DecorChangeDto> {
    const piece = await this.own(ctx, pieceId);
    const onIt = await ctx.manager.find(DecorPieceEntity, { where: { characterId: ctx.character.id, onId: piece.id } });
    const changed = [piece, ...onIt];
    for (const row of changed) this.putAway(row);
    await ctx.manager.save(changed);
    const eligible = (await this.eligibility(ctx)).eligible;
    return { pieces: changed.map((row) => this.toDto(ctx, row, eligible)) };
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
    return { piece: this.toDto(ctx, piece, (await this.eligibility(ctx)).eligible), price, balance: ctx.wallet.cash };
  }

  /** What stands in a host's home, for the host and for guests inside or invited. */
  async homeView(ctx: SimulationContext, hostId: string): Promise<DecorHomeDto> {
    const me = ctx.character;
    if (me.id !== hostId && me.locationId !== homeLocationId(hostId) && !(await this.access.invitedDoor(ctx, hostId))) {
      throw new ForbiddenActionException('You’re not invited into that home.');
    }
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

  // ----- Internals ---------------------------------------------------------------------------------------------

  private unitPrice(ctx: SimulationContext, base: number): number {
    return ctx.world.price(base, ctx.time);
  }

  private homeKeyOf(ctx: SimulationContext): string {
    return homeKey(ctx.character.id, ctx.character.homePropertyId);
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

  private async eligibility(ctx: SimulationContext): Promise<{ readonly eligible: boolean; readonly reason: string | null }> {
    const home = await this.household.home(ctx);
    const eligible = home.ownership === 'rented' || home.ownership === 'owned';
    return { eligible, reason: eligible ? null : NOT_YOUR_HOME };
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
  }

  private spotOf(row: DecorPieceEntity): DecorPieceDto['spot'] {
    if (!row.templateId || !row.roomId) return null;
    return { templateId: row.templateId, roomId: row.roomId, x: row.x, z: row.z, y: row.y, rot: row.rot, wall: row.wall, onId: row.onId };
  }

  /** A piece is shown placed only while you still live in the home it was put in (or while it is fitted in a plane). */
  private toDto(ctx: SimulationContext, row: DecorPieceEntity, eligible: boolean): DecorPieceDto {
    const here = eligible && row.homeKey === this.homeKeyOf(ctx);
    const base = { id: row.id, itemId: row.itemId, variant: row.variant, recolours: row.recolours };
    if (row.aircraftId) return { ...base, spot: this.spotOf(row), aircraftId: row.aircraftId };
    return { ...base, spot: here ? this.spotOf(row) : null };
  }
}
