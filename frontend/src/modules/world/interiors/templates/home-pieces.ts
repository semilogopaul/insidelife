import type { FurniturePlacement, HomeSlot } from './types';

/**
 * Tagging helpers for kit furniture in home templates (see `furnish.ts`); props carry `slot`/`base`/`fixture` inline.
 * `slot` makes a piece stand for an item; `base` makes it come with any item in the slot (the cabinet under the TV).
 */

/** Pieces that come with whatever fills `slot`. */
export function base(slot: HomeSlot, ...pieces: readonly FurniturePlacement[]): FurniturePlacement[] {
  return pieces.map((piece) => ({ ...piece, slot, base: true }));
}

/** Pieces that stand for the item in `slot` (shown only when it's yours, or provided). */
export function slotted(slot: HomeSlot, ...pieces: readonly FurniturePlacement[]): FurniturePlacement[] {
  return pieces.map((piece) => ({ ...piece, slot }));
}
