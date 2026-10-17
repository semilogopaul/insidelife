/**
 * Cabin decor: the rooms of the aircraft you can dress (cabin, cockpit, lavatory, suite of each of the seven classes),
 * which pieces may go where, and the placement check for them. It is the aircraft twin of `decor-rooms.ts`: the same
 * `DecorRoom` geometry and the same `checkDecorPlacement`, plus what only a plane needs (what is secured for flight,
 * beds only in a suite, a bare flight deck, a lower ceiling, fewer pieces per room).
 *
 * The 3D cabins live in `frontend/src/modules/world/aviation/cabin/cabin-layouts.ts`; a frontend test
 * (`aviation/tests/decor-rooms.test.ts`) fails if a cabin's size, doors or windows drift from this table. Room space is
 * the same as for homes: centred on the origin, back wall at -z, left wall at -x (the nose), y up. Template ids are the
 * layout ids `aircraft-<class>`; room ids are `cabin`, `cockpit`, `lavatory` and `suite`.
 */
import { checkDecorPlacement, type DecorPose, type PlacedDecor, type PlacementVerdict } from './decor-placement.js';
import type { DecorRoom } from './decor-rooms.js';
import { findDecorItem, type DecorItem } from './decor.js';

export const AIRCRAFT_DECOR_ROOMS = ['cabin', 'cockpit', 'lavatory', 'suite'] as const;
export type AircraftDecorRoomId = (typeof AIRCRAFT_DECOR_ROOMS)[number];

export const DECOR_AIRCRAFT_ROOMS = {
  'aircraft-piston-single': {
    cabin: { label: 'Cabin', width: 6, depth: 2.4, height: 1.5, doors: [{ wall: 'back', at: 2.45, width: 0.9 }], windows: [{ wall: 'back', at: -2, width: 0.42, sill: 0.54, height: 0.5 }, { wall: 'back', at: -0.65, width: 0.42, sill: 0.54, height: 0.5 }, { wall: 'back', at: 0.7, width: 0.42, sill: 0.54, height: 0.5 }], keepOut: [] },
  },
  'aircraft-piston-twin': {
    cabin: { label: 'Cabin', width: 7.4, depth: 2.5, height: 1.6, doors: [{ wall: 'back', at: 3.15, width: 0.9 }], windows: [{ wall: 'back', at: -2.7, width: 0.42, sill: 0.576, height: 0.5 }, { wall: 'back', at: -1.35, width: 0.42, sill: 0.576, height: 0.5 }, { wall: 'back', at: 0, width: 0.42, sill: 0.576, height: 0.5 }, { wall: 'back', at: 1.35, width: 0.42, sill: 0.576, height: 0.5 }], keepOut: [] },
  },
  'aircraft-turboprop': {
    cabin: { label: 'Cabin', width: 9.6, depth: 2.9, height: 1.85, doors: [{ wall: 'back', at: -3.7, width: 0.9 }, { wall: 'left', at: 0.5, width: 0.8 }], windows: [{ wall: 'back', at: -2.45, width: 0.42, sill: 0.666, height: 0.5 }, { wall: 'back', at: -1.1, width: 0.42, sill: 0.666, height: 0.5 }, { wall: 'back', at: 0.25, width: 0.42, sill: 0.666, height: 0.5 }, { wall: 'back', at: 1.6, width: 0.42, sill: 0.666, height: 0.5 }, { wall: 'back', at: 2.95, width: 0.42, sill: 0.666, height: 0.5 }], keepOut: [] },
    cockpit: { label: 'Cockpit', width: 2.8, depth: 2.6, height: 1.85, doors: [{ wall: 'back', at: 0.8, width: 0.7 }], windows: [{ wall: 'left', at: -0.6, width: 0.9, sill: 1, height: 0.6 }, { wall: 'left', at: 0.6, width: 0.9, sill: 1, height: 0.6 }], keepOut: [] },
  },
  'aircraft-light-jet': {
    cabin: { label: 'Cabin', width: 10, depth: 2.9, height: 1.95, doors: [{ wall: 'back', at: -3.9, width: 0.9 }, { wall: 'left', at: 0.5, width: 0.8 }, { wall: 'back', at: 4.1, width: 0.8 }], windows: [{ wall: 'back', at: -2.65, width: 0.42, sill: 0.702, height: 0.5 }, { wall: 'back', at: -1.3, width: 0.42, sill: 0.702, height: 0.5 }, { wall: 'back', at: 0.05, width: 0.42, sill: 0.702, height: 0.5 }, { wall: 'back', at: 1.4, width: 0.42, sill: 0.702, height: 0.5 }, { wall: 'back', at: 2.75, width: 0.42, sill: 0.702, height: 0.5 }], keepOut: [] },
    cockpit: { label: 'Cockpit', width: 2.8, depth: 2.6, height: 1.95, doors: [{ wall: 'back', at: 0.8, width: 0.7 }], windows: [{ wall: 'left', at: -0.6, width: 0.9, sill: 1, height: 0.6 }, { wall: 'left', at: 0.6, width: 0.9, sill: 1, height: 0.6 }], keepOut: [] },
    lavatory: { label: 'Lavatory', width: 2.2, depth: 2, height: 1.95, doors: [{ wall: 'left', at: 0.35, width: 0.7 }], windows: [{ wall: 'back', at: 0.45, width: 0.3, sill: 1.3, height: 0.35 }], keepOut: [] },
  },
  'aircraft-midsize-jet': {
    cabin: { label: 'Cabin', width: 13, depth: 3, height: 2.15, doors: [{ wall: 'back', at: -5.4, width: 0.9 }, { wall: 'left', at: 0.5, width: 0.8 }, { wall: 'back', at: 5.6, width: 0.8 }], windows: [{ wall: 'back', at: -4.15, width: 0.42, sill: 0.7739999999999999, height: 0.5 }, { wall: 'back', at: -2.8, width: 0.42, sill: 0.7739999999999999, height: 0.5 }, { wall: 'back', at: -1.45, width: 0.42, sill: 0.7739999999999999, height: 0.5 }, { wall: 'back', at: -0.1, width: 0.42, sill: 0.7739999999999999, height: 0.5 }, { wall: 'back', at: 1.25, width: 0.42, sill: 0.7739999999999999, height: 0.5 }, { wall: 'back', at: 2.6, width: 0.42, sill: 0.7739999999999999, height: 0.5 }, { wall: 'back', at: 3.95, width: 0.42, sill: 0.7739999999999999, height: 0.5 }], keepOut: [] },
    cockpit: { label: 'Cockpit', width: 2.8, depth: 2.6, height: 2.1, doors: [{ wall: 'back', at: 0.8, width: 0.7 }], windows: [{ wall: 'left', at: -0.6, width: 0.9, sill: 1, height: 0.6 }, { wall: 'left', at: 0.6, width: 0.9, sill: 1, height: 0.6 }], keepOut: [] },
    lavatory: { label: 'Lavatory', width: 2.2, depth: 2, height: 2.1, doors: [{ wall: 'left', at: 0.35, width: 0.7 }], windows: [{ wall: 'back', at: 0.45, width: 0.3, sill: 1.3, height: 0.35 }], keepOut: [] },
  },
  'aircraft-long-range-jet': {
    cabin: { label: 'Cabin', width: 17.4, depth: 3.2, height: 2.35, doors: [{ wall: 'back', at: -7.6, width: 0.9 }, { wall: 'left', at: 0.5, width: 0.8 }, { wall: 'back', at: 7.8, width: 0.8 }, { wall: 'back', at: 6.4, width: 0.9 }], windows: [{ wall: 'back', at: -6.35, width: 0.42, sill: 0.846, height: 0.5 }, { wall: 'back', at: -5, width: 0.42, sill: 0.846, height: 0.5 }, { wall: 'back', at: -3.65, width: 0.42, sill: 0.846, height: 0.5 }, { wall: 'back', at: -2.3, width: 0.42, sill: 0.846, height: 0.5 }, { wall: 'back', at: -0.95, width: 0.42, sill: 0.846, height: 0.5 }, { wall: 'back', at: 0.4, width: 0.42, sill: 0.846, height: 0.5 }, { wall: 'back', at: 1.75, width: 0.42, sill: 0.846, height: 0.5 }, { wall: 'back', at: 3.1, width: 0.42, sill: 0.846, height: 0.5 }, { wall: 'back', at: 4.45, width: 0.42, sill: 0.846, height: 0.5 }], keepOut: [] },
    cockpit: { label: 'Cockpit', width: 3.4, depth: 3, height: 2.1, doors: [{ wall: 'back', at: 1.1, width: 0.7 }], windows: [{ wall: 'left', at: -0.6, width: 0.9, sill: 1, height: 0.6 }, { wall: 'left', at: 0.6, width: 0.9, sill: 1, height: 0.6 }], keepOut: [] },
    lavatory: { label: 'Lavatory', width: 2.2, depth: 2, height: 2.1, doors: [{ wall: 'left', at: 0.35, width: 0.7 }], windows: [{ wall: 'back', at: 0.45, width: 0.3, sill: 1.3, height: 0.35 }], keepOut: [] },
    suite: { label: 'Suite', width: 4.2, depth: 3.2, height: 2.3, doors: [{ wall: 'left', at: 0.6, width: 0.9 }], windows: [{ wall: 'back', at: -1, width: 0.42, sill: 0.846, height: 0.5 }, { wall: 'back', at: 1, width: 0.42, sill: 0.846, height: 0.5 }], keepOut: [] },
  },
  'aircraft-airliner-jet': {
    cabin: { label: 'Cabin', width: 20.4, depth: 3.8, height: 2.6, doors: [{ wall: 'back', at: -9.1, width: 0.9 }, { wall: 'left', at: 0.5, width: 0.8 }, { wall: 'back', at: 9.3, width: 0.8 }, { wall: 'back', at: 7.9, width: 0.9 }], windows: [{ wall: 'back', at: -7.85, width: 0.42, sill: 0.9359999999999999, height: 0.5 }, { wall: 'back', at: -6.5, width: 0.42, sill: 0.9359999999999999, height: 0.5 }, { wall: 'back', at: -5.15, width: 0.42, sill: 0.9359999999999999, height: 0.5 }, { wall: 'back', at: -3.8, width: 0.42, sill: 0.9359999999999999, height: 0.5 }, { wall: 'back', at: -2.45, width: 0.42, sill: 0.9359999999999999, height: 0.5 }, { wall: 'back', at: -1.1, width: 0.42, sill: 0.9359999999999999, height: 0.5 }, { wall: 'back', at: 0.25, width: 0.42, sill: 0.9359999999999999, height: 0.5 }, { wall: 'back', at: 1.6, width: 0.42, sill: 0.9359999999999999, height: 0.5 }, { wall: 'back', at: 2.95, width: 0.42, sill: 0.9359999999999999, height: 0.5 }, { wall: 'back', at: 4.3, width: 0.42, sill: 0.9359999999999999, height: 0.5 }, { wall: 'back', at: 5.65, width: 0.42, sill: 0.9359999999999999, height: 0.5 }, { wall: 'back', at: 7, width: 0.42, sill: 0.9359999999999999, height: 0.5 }], keepOut: [] },
    cockpit: { label: 'Cockpit', width: 3.4, depth: 3, height: 2.1, doors: [{ wall: 'back', at: 1.1, width: 0.7 }], windows: [{ wall: 'left', at: -0.6, width: 0.9, sill: 1, height: 0.6 }, { wall: 'left', at: 0.6, width: 0.9, sill: 1, height: 0.6 }], keepOut: [] },
    lavatory: { label: 'Lavatory', width: 2.2, depth: 2, height: 2.1, doors: [{ wall: 'left', at: 0.35, width: 0.7 }], windows: [{ wall: 'back', at: 0.45, width: 0.3, sill: 1.3, height: 0.35 }], keepOut: [] },
    suite: { label: 'Suite', width: 4.2, depth: 3.8, height: 2.3, doors: [{ wall: 'left', at: 0.6, width: 0.9 }], windows: [{ wall: 'back', at: -1, width: 0.42, sill: 0.9359999999999999, height: 0.5 }, { wall: 'back', at: 1, width: 0.42, sill: 0.9359999999999999, height: 0.5 }], keepOut: [] },
  },
} as const satisfies Readonly<Record<string, Readonly<Partial<Record<AircraftDecorRoomId, DecorRoom>>>>>;

export type AircraftDecorTemplateId = keyof typeof DECOR_AIRCRAFT_ROOMS;

const TEMPLATE_PREFIX = 'aircraft-';

/** The decor template id (the cabin layout id) of an aircraft class: `aircraft-light-jet`. */
export const aircraftDecorTemplateId = (aircraftClass: string): string => `${TEMPLATE_PREFIX}${aircraftClass}`;

export const isAircraftDecorTemplate = (templateId: string): templateId is AircraftDecorTemplateId =>
  Object.hasOwn(DECOR_AIRCRAFT_ROOMS, templateId);

/** The room of an aircraft cabin layout, or undefined (a class without that room, homes, typos). */
export function findAircraftDecorRoom(templateId: string, roomId: string): DecorRoom | undefined {
  if (!isAircraftDecorTemplate(templateId)) return undefined;
  const rooms = DECOR_AIRCRAFT_ROOMS[templateId] as Readonly<Record<string, DecorRoom>>;
  return Object.hasOwn(rooms, roomId) ? rooms[roomId] : undefined;
}

/**
 * Where a character stands while aboard their plane or someone else's: `aircraft:<aircraft id>`. The decor server
 * shows an aircraft's cabin to its owner and to whoever is aboard (their `locationId` is this), and the 3D scene
 * derives which cabin it is drawing from it. Boarding sets the location; decor only reads it.
 */
export const AIRCRAFT_LOCATION_PREFIX = 'aircraft:';
export const aircraftLocationId = (aircraftId: string): string => `${AIRCRAFT_LOCATION_PREFIX}${aircraftId}`;
export const isAircraftLocation = (locationId: string): boolean => locationId.startsWith(AIRCRAFT_LOCATION_PREFIX);
export const aircraftIdOfLocation = (locationId: string): string | null =>
  isAircraftLocation(locationId) ? locationId.slice(AIRCRAFT_LOCATION_PREFIX.length) : null;

/** Most pieces in one room of an aircraft (a cabin has less room than a home, and less to spare for the weight). */
export const DECOR_AIRCRAFT_ROOM_CAP: Readonly<Record<AircraftDecorRoomId, number>> = { cabin: 14, suite: 10, lavatory: 3, cockpit: 3 };

export const aircraftRoomCap = (roomId: string): number =>
  (DECOR_AIRCRAFT_ROOM_CAP as Readonly<Record<string, number | undefined>>)[roomId] ?? 0;

/** Clear air kept above anything stood in a cabin (m). */
const HEADROOM = 0.05;

/**
 * Why a piece can't go in this room of an aircraft, or null when it can: not secured for flight, a bed outside a suite,
 * a floor piece on the flight deck or in the lavatory, or too tall for the ceiling. Pure.
 */
export function aircraftRoomIssue(roomId: string, room: Pick<DecorRoom, 'height'>, item: DecorItem): string | null {
  if (!item.aircraft) return `${item.name} isn’t secured for flight: it would break loose in turbulence.`;
  if (item.aircraft === 'suite' && roomId !== 'suite') return `${item.name} only fits in a suite, and sleeping needs a bed that’s bolted down.`;
  if (roomId === 'cockpit' && item.placement !== 'wall') return 'The flight deck keeps its floor and consoles clear: only pictures and mirrors go on its walls.';
  if (roomId === 'lavatory' && item.placement !== 'wall') return 'There’s only room on the wall of a lavatory.';
  if (item.placement !== 'tabletop' && item.height > room.height - HEADROOM) return `${item.name} is too tall for this ceiling.`;
  return null;
}

/**
 * The placement check for a cabin room: the aircraft rules above, then the same geometry check as a home's room
 * (`checkDecorPlacement`: bounds, doors, windows, overlap, surfaces) and a ceiling check for tabletop pieces.
 */
export function checkAircraftDecorPlacement(
  roomId: string,
  room: DecorRoom,
  item: DecorItem,
  requested: DecorPose,
  others: readonly PlacedDecor[],
): PlacementVerdict {
  const issue = aircraftRoomIssue(roomId, room, item);
  if (issue) return { ok: false, code: 'WRONG_PLACEMENT', reason: issue };
  const verdict = checkDecorPlacement(room, item, requested, others);
  if (verdict.ok && item.placement === 'tabletop' && verdict.pose.y + item.height > room.height - HEADROOM) {
    return { ok: false, code: 'OUT_OF_ROOM', reason: `${item.name} would touch the ceiling there.` };
  }
  return verdict;
}

/** Can this piece go anywhere in an aircraft? (The store uses it to show a "Cabin-ready" mark.) */
export const isCabinReady = (itemId: string): boolean => findDecorItem(itemId)?.aircraft !== undefined;
