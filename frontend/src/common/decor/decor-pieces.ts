import {
  findDecorItem,
  findDecorVariant,
  type DecorItem,
  type DecorPieceDto,
  type DecorPlacedDto,
  type DecorSpotDto,
  type DecorVariant,
  type PlacedDecor,
} from '@insidelife/shared';

/** A piece standing in a room, with its catalog item and finish resolved. */
export interface PlacedPiece {
  readonly id: string;
  readonly item: DecorItem;
  readonly variant: DecorVariant;
  readonly spot: DecorSpotDto;
}

/** Anything the server sends about a piece: yours (maybe in the inventory) or one standing in a host's home. */
export type PieceLike = Pick<DecorPieceDto, 'id' | 'itemId' | 'variant'> & { readonly spot: DecorSpotDto | null };

/** Resolve a piece against the catalog; unknown ids or finishes (a retired item) are dropped. */
export function resolvePiece(piece: PieceLike): PlacedPiece | null {
  const item = findDecorItem(piece.itemId);
  if (!item || !piece.spot) return null;
  const variant = findDecorVariant(item, piece.variant) ?? item.variants[0];
  return variant ? { id: piece.id, item, variant, spot: piece.spot } : null;
}

/** The pieces standing in one room of one home template. */
export function piecesInRoom(pieces: readonly PieceLike[], templateId: string, roomId: string): PlacedPiece[] {
  const list: PlacedPiece[] = [];
  for (const piece of pieces) {
    if (piece.spot?.templateId !== templateId || piece.spot.roomId !== roomId) continue;
    const resolved = resolvePiece(piece);
    if (resolved) list.push(resolved);
  }
  return list;
}

/** The same pieces as the shared placement check wants them. */
export const asPlacedDecor = (pieces: readonly PlacedPiece[]): PlacedDecor[] =>
  pieces.map((piece) => ({ id: piece.id, itemId: piece.item.id, pose: piece.spot }));

/** Pieces of yours that are not standing in this home template: in the inventory (or placed in another house). */
export function unplacedPieces(pieces: readonly DecorPieceDto[], templateId: string): DecorPieceDto[] {
  return pieces.filter((piece) => piece.spot === null || piece.spot.templateId !== templateId);
}

/** Group pieces of one item and finish ("Persian-style rug, Indigo ×2") for the inventory tray. */
export interface PieceGroup {
  readonly key: string;
  readonly item: DecorItem;
  readonly variant: DecorVariant;
  readonly pieces: readonly DecorPieceDto[];
}

export function groupPieces(pieces: readonly DecorPieceDto[]): PieceGroup[] {
  const groups = new Map<string, { item: DecorItem; variant: DecorVariant; pieces: DecorPieceDto[] }>();
  for (const piece of pieces) {
    const item = findDecorItem(piece.itemId);
    const variant = item ? (findDecorVariant(item, piece.variant) ?? item.variants[0]) : undefined;
    if (!item || !variant) continue;
    const key = `${item.id}|${variant.id}`;
    const group = groups.get(key);
    if (group) group.pieces.push(piece);
    else groups.set(key, { item, variant, pieces: [piece] });
  }
  return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
}

/** Host pieces (as visitors get them) shaped like your own, so one renderer serves both. */
export const asPieceLike = (placed: DecorPlacedDto): PieceLike => ({ id: placed.id, itemId: placed.itemId, variant: placed.variant, spot: placed.spot });
