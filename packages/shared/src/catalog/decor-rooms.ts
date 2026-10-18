import { DECOR_HOME_FIXTURES, DECOR_PROVIDED_FIXTURES } from './decor-fixtures.js';

/**
 * The rooms of the homes you can decorate (every home; in the family house and hostels only with small pieces), as the server needs
 * them to validate placements: floor size, openings and what's built in. The 3D templates in the frontend draw the
 * same rooms; a frontend test (`decor-rooms.test.ts`) fails if a template's size, doors or windows drift from this
 * table. Room space: centred on the origin, back wall at -z, left wall at -x, y up.
 */

export interface DecorOpening {
  readonly wall: 'back' | 'left';
  /** Centre along the wall (x for the back wall, z for the left wall). */
  readonly at: number;
  readonly width: number;
}

export interface DecorWindow extends DecorOpening {
  readonly sill: number;
  readonly height: number;
}

export interface DecorKeepOut {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Something standing on the floor that nothing of yours may go through: its middle, size and height (m). */
export interface DecorFixture {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
}

export interface DecorRoom {
  readonly label: string;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly doors: readonly DecorOpening[];
  readonly windows: readonly DecorWindow[];
  /** Staircases and stairwells: nothing is placed there. */
  readonly keepOut: readonly DecorKeepOut[];
  /** Fittings and (in the family house and hostels) the family's furniture: floor pieces keep clear of them. */
  readonly fixtures?: readonly DecorFixture[];
}

/** Door opening height (m). */
export const DECOR_DOOR_HEIGHT = 2.05;


export const DECOR_HOME_ROOMS = {
  'home-family': {
    room: { label: 'Your room', width: 6, depth: 5, height: 2.5, doors: [{ wall: 'back', at: 1.75, width: 0.9 }, { wall: 'left', at: 0.3, width: 0.9 }, { wall: 'left', at: 1.85, width: 0.9 }], windows: [{ wall: 'back', at: -1.6, width: 1.2, sill: 1.15, height: 0.9 }], keepOut: [] },
    kitchen: { label: 'Kitchen', width: 4.6, depth: 3.8, height: 2.5, doors: [{ wall: 'left', at: 0.8, width: 0.9 }], windows: [{ wall: 'back', at: 1.7, width: 0.9, sill: 1.15, height: 0.8 }], keepOut: [] },
    bathroom: { label: 'Bathroom', width: 3.4, depth: 3, height: 2.5, doors: [{ wall: 'left', at: 0.5, width: 0.8 }], windows: [{ wall: 'back', at: 0.95, width: 0.7, sill: 1.5, height: 0.5 }], keepOut: [] },
  },
  'home-hostel': {
    room: { label: 'Your room', width: 5.6, depth: 4.6, height: 2.6, doors: [{ wall: 'left', at: 1.3, width: 0.85 }, { wall: 'left', at: -0.2, width: 0.7 }, { wall: 'back', at: 0.85, width: 0.8 }], windows: [{ wall: 'back', at: -0.3, width: 1, sill: 0.85, height: 1.05 }], keepOut: [] },
    kitchen: { label: 'Shared kitchenette', width: 3.8, depth: 3.2, height: 2.6, doors: [{ wall: 'left', at: 0.6, width: 0.9 }], windows: [{ wall: 'back', at: 1.2, width: 0.8, sill: 1.15, height: 0.7 }], keepOut: [] },
    bathroom: { label: 'Shared bathroom', width: 3.4, depth: 3, height: 2.6, doors: [{ wall: 'left', at: 0.5, width: 0.8 }], windows: [{ wall: 'back', at: 0.95, width: 0.7, sill: 1.5, height: 0.5 }], keepOut: [] },
  },
  'home-face-me': {
    room: { label: 'Face-me-I-face-you room', width: 4.8, depth: 4.2, height: 2.4, doors: [{ wall: 'left', at: 1.2, width: 0.85 }, { wall: 'left', at: -1.3, width: 0.8 }], windows: [{ wall: 'back', at: 0.9, width: 1, sill: 1, height: 0.85 }], keepOut: [] },
    bathroom: { label: 'Compound bathroom', width: 3.2, depth: 2.8, height: 2.4, doors: [{ wall: 'left', at: 0.5, width: 0.8 }], windows: [{ wall: 'back', at: 0.8500000000000001, width: 0.7, sill: 1.5, height: 0.5 }], keepOut: [] },
  },
  'home-self-contain': {
    room: { label: 'Self-contain', width: 5.2, depth: 4.6, height: 2.5, doors: [{ wall: 'left', at: -0.6, width: 0.85 }], windows: [{ wall: 'back', at: -0.55, width: 0.9, sill: 1, height: 0.9 }], keepOut: [] },
  },
  'home-flat': {
    living: { label: 'Living room', width: 6.6, depth: 5.4, height: 2.6, doors: [{ wall: 'left', at: 1.55, width: 1 }, { wall: 'back', at: -0.6, width: 0.9 }, { wall: 'back', at: 2.4, width: 0.9 }], windows: [{ wall: 'back', at: 1.05, width: 1.1, sill: 1, height: 0.95 }, { wall: 'left', at: -0.9, width: 1.3, sill: 1, height: 1.05 }], keepOut: [] },
    kitchen: { label: 'Kitchen', width: 4.6, depth: 3.8, height: 2.6, doors: [{ wall: 'left', at: 0.8, width: 0.9 }], windows: [{ wall: 'back', at: 0.07, width: 1, sill: 1.15, height: 0.8 }], keepOut: [] },
    bedroom: { label: 'Bedroom', width: 5.4, depth: 4.6, height: 2.6, doors: [{ wall: 'left', at: -1.3, width: 0.9 }, { wall: 'left', at: 1.8, width: 0.8 }], windows: [{ wall: 'back', at: 1.6, width: 1.1, sill: 1, height: 0.95 }], keepOut: [] },
    bathroom: { label: 'Bathroom', width: 3.6, depth: 3, height: 2.6, doors: [{ wall: 'left', at: 0.5, width: 0.8 }], windows: [{ wall: 'back', at: 1.05, width: 0.7, sill: 1.5, height: 0.5 }], keepOut: [] },
  },
  'home-duplex': {
    living: { label: 'Living room', width: 8.4, depth: 6.2, height: 2.9, doors: [{ wall: 'left', at: -0.9, width: 1.2 }, { wall: 'back', at: 3.3, width: 1 }], windows: [{ wall: 'back', at: 0.75, width: 1.8, sill: 0.45, height: 1.9 }, { wall: 'left', at: 2.55, width: 1, sill: 1, height: 1.05 }], keepOut: [{ minX: -3.9, maxX: -0.8, minZ: -3.1, maxZ: -2.15 }] },
    kitchen: { label: 'Kitchen', width: 5.6, depth: 4.4, height: 2.9, doors: [{ wall: 'left', at: 1, width: 1 }], windows: [{ wall: 'back', at: 1, width: 1.3, sill: 1.1, height: 0.95 }], keepOut: [] },
    bedroom: { label: 'Master bedroom', width: 6.4, depth: 5.2, height: 2.9, doors: [{ wall: 'back', at: 2.75, width: 0.9 }], windows: [{ wall: 'back', at: 0.8, width: 1.6, sill: 0.85, height: 1.4 }, { wall: 'left', at: 2, width: 1, sill: 1, height: 1.05 }], keepOut: [{ minX: -3.2, maxX: -2.04, minZ: -2.28, maxZ: 0.2 }] },
    bathroom: { label: 'En-suite bathroom', width: 4, depth: 3.2, height: 2.9, doors: [{ wall: 'left', at: 0.5, width: 0.8 }], windows: [{ wall: 'back', at: 1.25, width: 0.7, sill: 1.5, height: 0.5 }], keepOut: [] },
  },
  'home-mansion': {
    living: { label: 'Living room', width: 10, depth: 7, height: 3.2, doors: [{ wall: 'left', at: -1.4, width: 1.4 }, { wall: 'back', at: 2.4, width: 1.4 }], windows: [{ wall: 'back', at: 0, width: 2, sill: 0.25, height: 2.5 }], keepOut: [{ minX: -4.6, maxX: -1, minZ: -3.5, maxZ: -2.4 }] },
    kitchen: { label: 'Kitchen', width: 7, depth: 5.4, height: 3.2, doors: [{ wall: 'left', at: 1.1, width: 1.4 }], windows: [{ wall: 'back', at: 0.98, width: 2, sill: 1.05, height: 1.4 }], keepOut: [] },
    cinema: { label: 'Cinema lounge', width: 7.2, depth: 5.6, height: 3, doors: [{ wall: 'back', at: 2.2, width: 1 }], windows: [], keepOut: [{ minX: -3.58, maxX: -2.42, minZ: -2.68, maxZ: 0 }] },
    master: { label: 'Master suite', width: 8, depth: 6, height: 3, doors: [{ wall: 'left', at: -1.6, width: 1 }, { wall: 'back', at: 1, width: 1 }], windows: [{ wall: 'back', at: -1.1, width: 2, sill: 0.25, height: 2.4 }], keepOut: [] },
    bathroom: { label: 'Master bathroom', width: 5.6, depth: 3.6, height: 3.2, doors: [{ wall: 'left', at: 0.5, width: 0.8 }], windows: [{ wall: 'back', at: 2.05, width: 0.7, sill: 1.5, height: 0.5 }], keepOut: [] },
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, DecorRoom>>>>;

export type DecorHomeTemplateId = keyof typeof DECOR_HOME_ROOMS;

/**
 * The room of a decorable home template (with the floor fittings pieces must keep clear of), or undefined (venues,
 * typos). `provided` is a home that comes furnished (the family house, a hostel): its furniture stays put and is part
 * of what you cannot go through.
 */
export function findDecorRoom(templateId: string, roomId: string, provided = false): DecorRoom | undefined {
  const rooms = (DECOR_HOME_ROOMS as Readonly<Record<string, Readonly<Record<string, DecorRoom>> | undefined>>)[templateId];
  const room = rooms && Object.hasOwn(rooms, roomId) ? rooms[roomId] : undefined;
  if (!room) return undefined;
  const fixtures = (provided ? DECOR_PROVIDED_FIXTURES : DECOR_HOME_FIXTURES)[templateId]?.[roomId];
  return fixtures ? { ...room, fixtures } : room;
}

export const isDecorTemplate = (templateId: string): templateId is DecorHomeTemplateId =>
  Object.hasOwn(DECOR_HOME_ROOMS, templateId);
