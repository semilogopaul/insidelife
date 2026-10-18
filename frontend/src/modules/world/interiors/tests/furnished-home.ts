import {
  DECOR_MAX_PER_ROOM,
  findDecorItem,
  furnitureDecorId,
  homeFurnishing,
  placeInHome,
  type DecorItem,
  type HomeFurnishing,
  type PlacedDecor,
} from '@insidelife/shared';
import type { PlacedPiece } from '@/common/decor';
import { HOME_LAYOUTS } from '../layouts/catalog';
import { withFunctionRooms } from '../layouts/function-rooms';
import type { HomeLayout } from '../layouts/types';
import { furnish, type FurnishOptions } from '../templates/furnish';
import type { InteriorTemplate } from '../templates/types';

/**
 * A home furnished the way the server does it, for tests: each piece goes where `placeInHome` puts it (a bed in the
 * bedroom, the table to eat at in the kitchen…), and every room is drawn with the pieces standing in it and what the
 * whole home does.
 */
export interface FurnishedHome {
  readonly layout: HomeLayout;
  readonly rooms: ReadonlyMap<string, InteriorTemplate>;
  readonly home: HomeFurnishing;
  readonly pieces: readonly PlacedPiece[];
  /** Where each piece went. */
  readonly roomOf: ReadonlyMap<string, string>;
}

/** A piece to bring: a shop furniture id (`bed-spring`) or a decor id (`bed-royal-gold`), optionally into a given room. */
export type Bring = string | { readonly item: string; readonly room: string };

const itemOf = (id: string): DecorItem => {
  const item = findDecorItem(furnitureDecorId(id)) ?? findDecorItem(id);
  if (!item) throw new Error(`no such piece ${id}`);
  return item;
};

export function furnishedHome(templateId: keyof typeof HOME_LAYOUTS, bring: readonly Bring[], fitted: readonly string[] = [], options: Partial<FurnishOptions> = {}): FurnishedHome {
  const base = HOME_LAYOUTS[templateId];
  const roomIds = base.rooms.map((room) => room.id);
  const byRoom = new Map<string, PlacedDecor[]>();
  const pieces: PlacedPiece[] = [];
  const roomOf = new Map<string, string>();
  bring.forEach((entry, index) => {
    const item = itemOf(typeof entry === 'string' ? entry : entry.item);
    const preferred = typeof entry === 'string' ? null : entry.room;
    const hit = placeInHome(templateId, roomIds, item, (roomId) => byRoom.get(roomId) ?? [], { preferred, cap: DECOR_MAX_PER_ROOM });
    if (!hit) throw new Error(`${item.id} found no room in ${templateId}`);
    const id = `piece-${index}-${item.id}`;
    byRoom.set(hit.roomId, [...(byRoom.get(hit.roomId) ?? []), { id, itemId: item.id, pose: hit.pose }]);
    roomOf.set(id, hit.roomId);
    pieces.push({ id, item, variant: item.variants[0]!, spot: { templateId, roomId: hit.roomId, ...hit.pose } });
  });
  const home = homeFurnishing(
    templateId,
    pieces.map((piece) => ({ id: piece.id, itemId: piece.item.id, roomId: piece.spot.roomId, pose: piece.spot })),
  );
  const layout = withFunctionRooms(base, home);
  const rooms = new Map(
    layout.rooms.map((room) => [
      room.id,
      furnish(room.template, fitted, { providedFurniture: false, pieces: pieces.filter((piece) => piece.spot.roomId === room.id), home, roomId: room.id, ...options }),
    ]),
  );
  return { layout, rooms, home, pieces, roomOf };
}

/** Bring as much of `wanted` as fits (a face-me room has no space for everything); `left` is what found no room. */
export function furnishedAsFarAsItFits(templateId: keyof typeof HOME_LAYOUTS, wanted: readonly string[], fitted: readonly string[] = [], options: Partial<FurnishOptions> = {}): FurnishedHome & { readonly left: readonly string[] } {
  const roomIds = HOME_LAYOUTS[templateId].rooms.map((room) => room.id);
  const byRoom = new Map<string, PlacedDecor[]>();
  const fits: string[] = [];
  const left: string[] = [];
  wanted.forEach((id, index) => {
    const item = itemOf(id);
    const hit = placeInHome(templateId, roomIds, item, (roomId) => byRoom.get(roomId) ?? [], { cap: DECOR_MAX_PER_ROOM });
    if (!hit) {
      left.push(id);
      return;
    }
    fits.push(id);
    byRoom.set(hit.roomId, [...(byRoom.get(hit.roomId) ?? []), { id: `try-${index}`, itemId: item.id, pose: hit.pose }]);
  });
  return { ...furnishedHome(templateId, fits, fitted, options), left };
}
