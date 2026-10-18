/** Decor API contracts — owned by the decor domain. */
import type { DecorWall } from '../catalog/decor-placement.js';
import type { HomeFurnishing } from '../catalog/furnishing.js';

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
  /** Set while the piece is fitted in one of your aircraft (its `spot` is then a cabin room); absent otherwise. */
  readonly aircraftId?: string;
}

export interface DecorHomeStatusDto {
  /** You can put pieces in the home you live in (every home: small ones in the family house and hostels). */
  readonly eligible: boolean;
  readonly reason: string | null;
  /** `full`: anything, and the furniture you buy is what the home uses. `small`: the family house and hostels keep their own furniture; your own pieces there are small ones. */
  readonly scope: 'full' | 'small';
  /** The interior template of the home you live in (`home-flat`…). */
  readonly templateId: string;
  readonly ownership: 'family' | 'rented' | 'owned' | 'hostel';
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
  /** What each piece fetches if you sell it back to the furniture store today (piece id → naira). */
  readonly sellBacks: Readonly<Record<string, number>>;
  /** What the pieces standing in your home do right now: the best bed, the table to eat at… */
  readonly furnishing: HomeFurnishing;
  /** Sleep quality the home gives (0-1): the best bed placed in it. */
  readonly bedQuality: number;
}

/** POST /v1/decor/purchases */
export interface DecorPurchaseRequest {
  readonly itemId: string;
  readonly variant: string;
  readonly quantity?: number;
  /** Put the new pieces straight into this room at free valid spots (those that don't fit stay in the inventory). */
  readonly place?: { readonly templateId: string; readonly roomId: string };
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

/** GET /v1/decor/aircraft/:aircraftId — an aircraft's cabin decor, for its owner and whoever is aboard. */
export interface DecorAircraftDto {
  readonly aircraftId: string;
  /** Shared catalog class of the aircraft (`light-jet`…); the cabin layout is `aircraft-<class>`. */
  readonly aircraftClass: string;
  readonly ownerId: string;
  readonly placed: readonly DecorPlacedDto[];
}

/** POST /v1/decor/pieces/:id/sell — sell a piece back to the furniture store. */
export interface DecorSellResultDto {
  readonly pieceId: string;
  /** What it fetched (a share of today's price, less for worn furniture). */
  readonly amount: number;
  readonly balance: number;
  /** Pieces that were sitting on it and went back to the inventory. */
  readonly changed: readonly DecorPieceDto[];
}

/** What to do with the old piece when a better one comes. */
export type DecorReplaceMode = 'store' | 'sell';

/** POST /v1/decor/pieces/:id/replace — the new piece takes the old one's place; the old is stored or sold back. */
export interface DecorReplaceRequest {
  readonly oldId: string;
  readonly mode: DecorReplaceMode;
}

export interface DecorReplaceResultDto {
  readonly pieces: readonly DecorPieceDto[];
  /** What the old piece fetched when sold, else 0. */
  readonly amount: number;
  readonly balance: number;
  readonly soldId: string | null;
}

/** POST /v1/decor/arrange — put every piece that isn't standing in your home into it, at good spots. */
export interface DecorArrangeRequest {
  /** Prefer this room (the one you are in). */
  readonly roomId?: string;
}

export interface DecorArrangeResultDto {
  readonly pieces: readonly DecorPieceDto[];
  /** Pieces that found no room (they stay in the inventory). */
  readonly left: number;
}

/** What bought furniture did: where it went, and what it could replace. Sent with the shop purchase. */
export interface FurniturePurchaseDto {
  /** The new pieces (placed in your home when there was room, else in the inventory). */
  readonly pieces: readonly DecorPieceDto[];
  /** Older pieces for the same job that the new one outclasses (an older bed, a smaller TV): offer to replace them. */
  readonly replaces: readonly DecorPieceDto[];
  /** What each of those fetches if sold back. */
  readonly sellBacks: Readonly<Record<string, number>>;
}
