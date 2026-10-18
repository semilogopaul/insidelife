import { FURNITURE_SLOTS, type DecorFixture, type FurnitureSlot } from '@insidelife/shared';
import { fixturesOf } from '../decor/fixtures';
import { furnish } from '../templates/furnish';
import type { LayoutRoom } from '../layouts/types';
import { furnitureFootprint, propFootprint } from '../walk/colliders';

/**
 * What the shared tables (`decor-fixtures.ts`, `furniture-slots.ts`) are generated from: the fixtures of each home room
 * as the 3D templates draw them, and where each movable slot's piece stands in the template. Used by the sync tests
 * (a drifting template fails them) and by the table generator.
 */

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Floor-standing things in the room that a piece of yours cannot go through. In a home you rent or own that is the
 * building (kitchen units, bathroom fittings, stairs); in the family house and hostels (`provided`) it is all the
 * family's / the school's furniture too.
 */
export function roomFixtures(room: LayoutRoom, provided: boolean): DecorFixture[] {
  const bare = furnish(room.template, [], { providedFurniture: provided });
  const list = fixturesOf(bare)
    .filter((fixture) => fixture.height > 0.05)
    .map((fixture) => ({ x: round(fixture.rect.x), z: round(fixture.rect.z), w: round(fixture.rect.w), d: round(fixture.rect.d), h: round(fixture.height) }));
  if (provided) return list;
  // The spots of appliances and fittings you may buy (the fridge, the cooker, the washer, the bar stools, the cinema
  // seats) are reserved too: they are built in and do not move, so nothing of yours goes where they will stand.
  for (const piece of [...room.template.furniture, ...room.template.props]) {
    if (!piece.slot || !FITTED_FLOOR_SLOTS.has(piece.slot) || (piece.y ?? 0) >= 0.3) continue;
    const box = 'model' in piece ? furnitureFootprint(piece) : propFootprint(piece);
    if (!box || box.height <= 0.05) continue;
    // …with room to stand in front of it (you cook, wash and fetch from the front).
    const turn = ((((piece.rot ?? 0) % 360) + 360) % 360);
    const grown = {
      minX: box.minX - (turn === 270 ? STAND_IN_FRONT : 0),
      maxX: box.maxX + (turn === 90 ? STAND_IN_FRONT : 0),
      minZ: box.minZ - (turn === 180 ? STAND_IN_FRONT : 0),
      maxZ: box.maxZ + (turn === 0 ? STAND_IN_FRONT : 0),
    };
    list.push({ x: round((grown.minX + grown.maxX) / 2), z: round((grown.minZ + grown.maxZ) / 2), w: round(grown.maxX - grown.minX), d: round(grown.maxZ - grown.minZ), h: round(box.height) });
  }
  return list;
}

/** Slots that stay where the building put them (appliances and fittings), as opposed to pieces you move. */
/** Room kept clear in front of a fitted appliance (m). */
const STAND_IN_FRONT = 0.8;

const FITTED_FLOOR_SLOTS: ReadonlySet<string> = new Set(['fridge', 'cooker', 'laundry', 'generator', 'fan', 'aquarium', 'bar', 'cinema']);

/** Where the template's own piece of each movable slot stands (centre of its first non-base piece, and its turn). */
export function roomSlotSpots(room: LayoutRoom): Partial<Record<FurnitureSlot, readonly [number, number, number]>> {
  const spots: Partial<Record<FurnitureSlot, readonly [number, number, number]>> = {};
  for (const piece of [...room.template.furniture, ...room.template.props]) {
    const slot = piece.slot as FurnitureSlot | undefined;
    if (!slot || piece.base || !(FURNITURE_SLOTS as readonly string[]).includes(slot) || spots[slot]) continue;
    spots[slot] = [round(piece.at[0]), round(piece.at[1]), piece.rot ?? 0];
  }
  return spots;
}
