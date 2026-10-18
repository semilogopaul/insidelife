import { DECOR_MAX_PER_ROOM, findDecorItem, furnitureDecorId, placeInHome, type PlacedDecor } from '@insidelife/shared';
import type { PlacedPiece } from '@/common/decor';

/**
 * Pieces for a preview (`/dev/interiors?items=bed-spring,tv-55`): every furniture item named is put where the server
 * would put a purchase of it (a bed in the bedroom, the table in the kitchen…). Items that aren't movable furniture are
 * left to `furnish`'s fitted slots.
 */
export function autoFurnish(templateId: string, roomIds: readonly string[], itemIds: readonly string[]): PlacedPiece[] {
  const byRoom = new Map<string, PlacedDecor[]>();
  const pieces: PlacedPiece[] = [];
  itemIds.forEach((id, index) => {
    const item = findDecorItem(furnitureDecorId(id));
    if (!item) return;
    const hit = placeInHome(templateId, roomIds, item, (roomId) => byRoom.get(roomId) ?? [], { cap: DECOR_MAX_PER_ROOM });
    if (!hit) return;
    const pieceId = `preview-${index}-${id}`;
    byRoom.set(hit.roomId, [...(byRoom.get(hit.roomId) ?? []), { id: pieceId, itemId: item.id, pose: hit.pose }]);
    pieces.push({ id: pieceId, item, variant: item.variants[0]!, spot: { templateId, roomId: hit.roomId, ...hit.pose } });
  });
  return pieces;
}
