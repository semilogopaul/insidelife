/** Decor API contracts — owned by the decor domain. */
import type { DecorWall } from '../catalog/decor-placement.js';

/** Where a piece stands in a home: the template (`home-flat`…), the room (`living`…) and the pose in room space. */
export interface DecorSpotDto {
  readonly templateId: string;
  readonly roomId: string;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly rot: number;
  readonly wall: DecorWall | null;
  /** Tabletop pieces: the piece they sit on. */
  readonly onId: string | null;
}

/** A piece you own. `spot` is null while it's in your inventory (or placed in a home you no longer live in). */
export interface DecorPieceDto {
  readonly id: string;
  readonly itemId: string;
  readonly variant: string;
  readonly spot: DecorSpotDto | null;
  /** How many times it has been re-coloured (each costs money). */
  readonly recolours: number;
}

export interface DecorHomeStatusDto {
  /** You can decorate the home you live in (rented or owned; never the family house or a hostel). */
  readonly eligible: boolean;
  readonly reason: string | null;
}

/** GET /v1/decor */
export interface DecorStateDto {
  readonly pieces: readonly DecorPieceDto[];
  /** Today's price of every catalog item (world price index applied). */
  readonly prices: Readonly<Record<string, number>>;
  /** Today's price of re-colouring each catalog item. */
  readonly recolourPrices: Readonly<Record<string, number>>;
  readonly home: DecorHomeStatusDto;
  readonly limits: { readonly perRoom: number; readonly owned: number };
}

/** POST /v1/decor/purchases */
export interface DecorPurchaseRequest {
  readonly itemId: string;
  readonly variant: string;
  readonly quantity?: number;
  readonly idempotencyKey?: string;
}

export interface DecorPurchaseResultDto {
  readonly pieces: readonly DecorPieceDto[];
  readonly unitPrice: number;
  readonly total: number;
  readonly balance: number;
}

/** PUT /v1/decor/pieces/:id/spot — put an inventory piece down, or move/turn a placed one. */
export interface DecorPlaceRequest {
  readonly templateId: string;
  readonly roomId: string;
  readonly x: number;
  readonly z: number;
  readonly y?: number;
  readonly rot: number;
  readonly wall?: DecorWall | null;
  readonly onId?: string | null;
}

/** The pieces that changed (a moved table takes what's on it along). */
export interface DecorChangeDto {
  readonly pieces: readonly DecorPieceDto[];
}

/** POST /v1/decor/pieces/:id/recolour */
export interface DecorRecolourRequest {
  readonly variant: string;
  readonly idempotencyKey?: string;
}

export interface DecorRecolourResultDto {
  readonly piece: DecorPieceDto;
  readonly price: number;
  readonly balance: number;
}

/** A piece standing in someone's home, as visitors see it. */
export interface DecorPlacedDto {
  readonly id: string;
  readonly itemId: string;
  readonly variant: string;
  readonly spot: DecorSpotDto;
}

/** GET /v1/decor/homes/:hostId */
export interface DecorHomeDto {
  readonly hostId: string;
  readonly placed: readonly DecorPlacedDto[];
}
