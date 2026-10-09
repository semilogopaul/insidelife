import { BED_TOP, bed, npc, place, row, seat, stand } from '../helpers';
import { base, slotted } from '../home-pieces';
import type { InteriorTemplate } from '../types';

/**
 * The other rooms of multi-room homes (the living rooms are the `home-*` templates in `homes.ts`). Each is a normal
 * single-room template; `layouts/catalog.ts` joins them with doors and stairs. Every home slot lives in exactly one
 * room of a layout (home-wide decor such as art and clocks aside), so a bought fridge shows in the kitchen and a bed
 * in the bedroom. Pieces are tagged as in `homes.ts`: built-in cabinets, sinks, showers and stairwells are fixtures.
 */

const BLACK = { wood: '#1c1c1c', woodDark: '#111111' } as const;

// ---------------------------------------------------------------------------------------------------------------
// Flat
// ---------------------------------------------------------------------------------------------------------------

/** A flat's kitchen: fridge, gas cooker and sink along the back, washing machine by the door. */
export const FLAT_KITCHEN: InteriorTemplate = {
  id: 'home-flat:kitchen',
  label: 'Kitchen',
  room: {
    width: 4.6,
    depth: 3.8,
    height: 2.6,
    floor: 'tiles',
    floorColor: '#d8d2c4',
    wall: { style: 'tiles', color: '#eef2ee', band: '#7fa99b' },
    windows: [{ wall: 'back', at: 0.07, width: 1.0, sill: 1.15, height: 0.8 }],
    doors: [{ wall: 'left', at: 0.8, width: 0.9 }],
    curtain: '#f6b90b',
  },
  furniture: [
    place('kitchenFridge', [-1.9, -1.66], 0, { slot: 'fridge' }),
    place('kitchenCabinet', [-1.22, -1.54]),
    place('kitchenStove', [-0.575, -1.54], 0, { slot: 'cooker' }),
    place('kitchenSink', [0.07, -1.54]),
    place('kitchenCabinetDrawer', [0.715, -1.54]),
    place('kitchenCabinet', [1.36, -1.54]),
    place('kitchenCabinetUpper', [-1.22, -1.73], 0, { y: 1.35 }),
    place('kitchenCabinetUpper', [0.715, -1.73], 0, { y: 1.35 }),
    place('kitchenCabinetUpper', [1.36, -1.73], 0, { y: 1.35 }),
    place('kitchenMicrowave', [1.36, -1.58], 0, { y: 0.68, slot: 'microwave' }),
    place('kitchenBlender', [0.715, -1.6], 0, { y: 0.68, slot: 'blender' }),
    place('toaster', [-1.22, -1.6], 0, { y: 0.68, slot: 'toaster' }),
    place('washer', [-1.98, -0.7], 90, { slot: 'laundry' }),
    ...base('cooker', place('trashcan', [2.0, -1.6])),
  ],
  props: [
    { kind: 'pot', at: [-0.575, -1.54], y: 0.68, r: 0.15, slot: 'cooker', base: true },
    {
      kind: 'sign',
      at: [-2.28, 0.05],
      rot: 90,
      y: 1.6,
      wall: true,
      size: [0.5, 0.42],
      lines: ['OUR DAILY', 'BREAD'],
      bg: '#fff8e1',
      fg: '#6d4c41',
      accent: '#e65100',
      style: 'poster',
      slot: 'art',
    },
    { kind: 'wall-clock', at: [-0.575, -1.88], y: 1.85, slot: 'clock' },
    { kind: 'water-dispenser', at: [2.0, -0.9], slot: 'dispenser' },
    { kind: 'bucket', at: [1.85, 1.35], color: '#1e88e5', slot: 'buckets' },
    { kind: 'bucket', at: [1.5, 1.55], color: '#e53935', slot: 'buckets' },
  ],
  player: {
    default: stand([0.4, 0.6], 200),
    cook: stand([-0.575, -0.85], 180, 'cook'),
  },
  npcs: [],
  guests: [stand([1.2, 0.7], 220, 'talk')],
  lighting: {
    mood: 'home',
    practicals: [
      [-0.4, 2.3, -0.6],
      [1.0, 2.3, 0.8],
    ],
  },
};

/** A flat's bedroom: double bed, wardrobe, a study desk under the window and a shower corner. */
export const FLAT_BEDROOM: InteriorTemplate = {
  id: 'home-flat:bedroom',
  label: 'Bedroom',
  room: {
    width: 5.4,
    depth: 4.6,
    height: 2.6,
    floor: 'tiles',
    floorColor: '#d9cfbe',
    wall: { style: 'paint', color: '#efe4d6', band: '#a1887f' },
    windows: [{ wall: 'back', at: 1.6, width: 1.1, sill: 1.0, height: 0.95 }],
    doors: [{ wall: 'left', at: -1.3, width: 0.9 }],
    curtain: '#7b1fa2',
  },
  furniture: [
    place('bedDouble', [-0.6, -1.45], 0, {
      slot: 'bed',
      palette: { carpet: '#e8e2d6', carpetDarker: '#7b1fa2', carpetWhite: '#ffffff' },
    }),
    ...base('bed', place('cabinetBedDrawer', [-1.6, -2.12]), place('cabinetBedDrawer', [0.42, -2.12])),
    place('lampRoundTable', [-1.6, -2.12], 0, { y: 0.39, slot: 'lights' }),
    place('bookcaseClosedWide', [-2.48, -0.15], 90, {
      slot: 'storage',
      palette: { wood: '#7a4a2a', woodDark: '#5d3a22' },
    }),
    ...slotted('desk', place('desk', [1.6, -2.0], 0, { palette: { wood: '#a0683a' } }), place('chairDesk', [1.6, -1.35], 180)),
    place('laptop', [1.55, -2.05], 0, { y: 0.57, slot: 'laptop' }),
    place('books', [1.95, -2.1], 0, { y: 0.57, slot: 'books' }),
    place('shower', [-2.25, 1.85]),
  ],
  props: [
    // The shower corner's tray.
    { kind: 'mat', at: [-2.05, 1.55], size: [1.3, 1.5], color: '#cfd8dc', border: '#90a4ae', fixture: true },
    { kind: 'bucket', at: [-1.55, 2.0], color: '#43a047', slot: 'buckets' },
    { kind: 'aircon', at: [-0.6, -2.28], y: 2.15, slot: 'ac' },
    { kind: 'lantern', at: [0.42, -2.12], y: 0.39, slot: 'lamp' },
    {
      kind: 'sign',
      at: [-0.6, -2.28],
      y: 1.45,
      wall: true,
      size: [0.7, 0.32],
      lines: ['GOD’S TIME', 'IS THE BEST'],
      bg: '#fff8e1',
      fg: '#3e2723',
      accent: '#c9a227',
      frame: '#8d6e63',
      slot: 'art',
    },
    { kind: 'mirror', at: [-2.68, 0.85], rot: 90, y: 1.35, size: [0.38, 0.6], frame: '#8d6e63', slot: 'mirror' },
  ],
  player: {
    default: stand([0.5, 0.8], 30),
    sleep: bed([-0.6, -1.45]),
    sit: seat([1.6, -1.35], 180, 'sit', { props: false }),
    type: seat([1.6, -1.35], 180, 'type', { props: false }),
    read: seat([1.6, -1.35], 180, 'read'),
    shower: stand([-2.25, 1.8], 45, 'shower'),
  },
  npcs: [],
  guests: [stand([0.9, 1.3], 220, 'talk')],
  lighting: {
    mood: 'home',
    practicals: [
      [-0.4, 2.3, -0.6],
      [1.4, 2.2, -1.2],
    ],
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Duplex
// ---------------------------------------------------------------------------------------------------------------

/** The duplex kitchen: a full counter, big fridge, an island with stools and the house help at the sink. */
export const DUPLEX_KITCHEN: InteriorTemplate = {
  id: 'home-duplex:kitchen',
  label: 'Kitchen',
  room: {
    width: 5.6,
    depth: 4.4,
    height: 2.9,
    floor: 'tiles',
    floorColor: '#e4ddd0',
    wall: { style: 'tiles', color: '#f4efe6', band: '#8d6e63' },
    windows: [{ wall: 'back', at: 1.0, width: 1.3, sill: 1.1, height: 0.95 }],
    doors: [{ wall: 'left', at: 1.0, width: 1.0 }],
    curtain: '#7b2d3b',
  },
  furniture: [
    place('kitchenFridgeLarge', [-2.35, -1.875], 0, { slot: 'fridge' }),
    place('kitchenCabinetDrawer', [-1.6, -1.84]),
    place('kitchenStove', [-0.955, -1.84], 0, { slot: 'cooker' }),
    place('kitchenCabinet', [-0.31, -1.84]),
    place('kitchenCabinet', [0.335, -1.84]),
    place('kitchenSink', [0.98, -1.84]),
    place('kitchenCabinetDrawer', [1.625, -1.84]),
    place('kitchenCabinet', [2.27, -1.84]),
    place('kitchenCabinetUpper', [-1.6, -2.03], 0, { y: 1.45 }),
    place('kitchenCabinetUpper', [-0.31, -2.03], 0, { y: 1.45 }),
    place('kitchenCabinetUpper', [2.27, -2.03], 0, { y: 1.45 }),
    place('kitchenCoffeeMachine', [-1.6, -1.88], 0, { y: 0.68, slot: 'coffee' }),
    place('toaster', [-0.31, -1.88], 0, { y: 0.68, slot: 'toaster' }),
    place('kitchenMicrowave', [2.27, -1.88], 0, { y: 0.68, slot: 'microwave' }),
    place('kitchenBlender', [1.625, -1.9], 0, { y: 0.68, slot: 'blender' }),
    // The island is built in; its stools come with a home bar.
    ...row('kitchenCabinet', 3, [-0.3, 0.0], [0.645, 0], 180),
    ...row('kitchenBar', 3, [-0.3, 0.49], [0.645, 0], 0),
    ...row('stoolBar', 3, [-0.3, 1.05], [0.645, 0], 180, { slot: 'bar' }),
    place('washer', [-2.5, -0.5], 90, { slot: 'laundry' }),
    ...base('cooker', place('trashcan', [2.6, -1.05])),
  ],
  props: [
    { kind: 'pot', at: [-0.955, -1.84], y: 0.68, r: 0.16, slot: 'cooker', base: true },
    { kind: 'food-plate', at: [0.345, 0.0], y: 0.68, food: 'jollof', slot: 'pantry' },
    {
      kind: 'sign',
      at: [-2.78, -1.15],
      rot: 90,
      y: 1.75,
      wall: true,
      size: [0.62, 0.42],
      lines: ['NO WAHALA', 'IN MY KITCHEN'],
      bg: '#fff3e0',
      fg: '#bf360c',
      accent: '#2e7d32',
      style: 'poster',
      slot: 'art',
    },
    { kind: 'wall-clock', at: [-0.955, -2.18], y: 1.95, slot: 'clock' },
    { kind: 'water-dispenser', at: [2.45, 1.7], slot: 'dispenser' },
  ],
  player: {
    default: stand([0.4, 1.6], 200),
    cook: stand([-0.955, -1.15], 180, 'cook'),
    eat: seat([0.345, 1.05], 180, 'eat', { y: 0.27 }),
  },
  npcs: [npc(stand([0.98, -1.15], 180, 'cook'), 'market', { gender: 'female' })],
  guests: [seat([0.99, 1.05], 180, 'talk', { y: 0.27 })],
  lighting: {
    mood: 'home',
    practicals: [
      [-0.9, 2.5, -1.0],
      [0.4, 2.5, 0.4],
      [-2.0, 2.5, 1.2],
    ],
  },
};

/** Upstairs in the duplex: the master bedroom off the landing, with a study desk and a shower corner. */
export const DUPLEX_BEDROOM: InteriorTemplate = {
  id: 'home-duplex:bedroom',
  label: 'Master bedroom',
  room: {
    width: 6.4,
    depth: 5.2,
    height: 2.9,
    floor: 'wood',
    floorColor: '#9c6b45',
    wall: { style: 'wallpaper', color: '#e9dfcf' },
    windows: [
      { wall: 'back', at: 0.8, width: 1.6, sill: 0.85, height: 1.4 },
      { wall: 'left', at: 2.0, width: 1.0, sill: 1.0 },
    ],
    curtain: '#24506b',
  },
  furniture: [
    place('bedDouble', [0.8, -1.65], 0, {
      scale: 1.15,
      slot: 'bed',
      palette: { carpet: '#f1ebe0', carpetDarker: '#24506b', carpetWhite: '#ffffff' },
    }),
    ...base('bed', place('cabinetBedDrawer', [-0.3, -2.42]), place('cabinetBedDrawer', [1.95, -2.42])),
    place('lampRoundTable', [-0.3, -2.42], 0, { y: 0.39, slot: 'lights' }),
    place('lampRoundTable', [1.95, -2.42], 0, { y: 0.39, slot: 'lights' }),
    place('bookcaseClosedWide', [-1.4, -2.39], 0, {
      slot: 'storage',
      palette: { wood: '#5d4037', woodDark: '#3e2723' },
    }),
    ...slotted('desk', place('desk', [-2.88, 2.0], 90, { palette: { wood: '#5d4037' } }), place('chairDesk', [-2.25, 2.0], -90)),
    place('laptop', [-2.9, 1.95], 90, { y: 0.57, slot: 'laptop' }),
    place('books', [-2.95, 2.35], 90, { y: 0.57, slot: 'books' }),
    place('shower', [2.75, 2.15]),
    place('pottedPlant', [3.0, -2.35], 0, { slot: 'plants' }),
  ],
  props: [
    { kind: 'stairwell', at: [-2.62, -1.0], size: [1.0, 2.4], color: '#8d6e63', rail: '#3e2723' },
    // The shower corner: tray and glass screen.
    { kind: 'mat', at: [2.45, 1.95], size: [1.5, 1.3], color: '#d7e3e8', border: '#90a4ae', fixture: true },
    { kind: 'box', at: [1.68, 1.95], size: [0.05, 1.8, 1.2], color: '#bfe3f0', surface: 'gloss', round: 0.1, fixture: true },
    { kind: 'bucket', at: [2.05, 2.35], color: '#1e88e5', slot: 'buckets' },
    { kind: 'aircon', at: [-3.18, 0.6], rot: 90, y: 2.35, slot: 'ac' },
  ],
  player: {
    default: stand([0.4, 0.8], 30),
    sleep: bed([0.8, -1.65], 0, BED_TOP * 1.15),
    sit: seat([-2.25, 2.0], -90, 'sit', { props: false }),
    type: seat([-2.25, 2.0], -90, 'type', { props: false }),
    read: seat([-2.25, 2.0], -90, 'read'),
    shower: stand([2.75, 2.1], 200, 'shower'),
  },
  npcs: [],
  guests: [stand([0.0, 1.4], 200, 'talk')],
  lighting: {
    mood: 'home',
    practicals: [
      [0.6, 2.6, -0.8],
      [-1.8, 2.6, 1.0],
      [2.4, 2.6, 1.8],
    ],
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Mansion
// ---------------------------------------------------------------------------------------------------------------

/** The mansion kitchen: black-and-gold cabinetry, a marble island with stools, the cook at the sink. */
export const MANSION_KITCHEN: InteriorTemplate = {
  id: 'home-mansion:kitchen',
  label: 'Kitchen',
  room: {
    width: 7.0,
    depth: 5.4,
    height: 3.2,
    floor: 'marble',
    floorColor: '#e9e4da',
    wall: { style: 'tiles', color: '#f7f5f0', band: '#2b2b2b' },
    windows: [{ wall: 'back', at: 0.98, width: 2.0, sill: 1.05, height: 1.4, bars: false }],
    doors: [{ wall: 'left', at: 1.1, width: 1.4 }],
    curtain: '#c9a227',
  },
  furniture: [
    place('kitchenFridgeLarge', [-3.0, -2.38], 0, { slot: 'fridge' }),
    place('kitchenCabinetDrawer', [-2.25, -2.34], 0, { palette: BLACK }),
    place('kitchenStove', [-1.605, -2.34], 0, { slot: 'cooker' }),
    place('kitchenCabinet', [-0.96, -2.34], 0, { palette: BLACK }),
    place('kitchenCabinet', [-0.315, -2.34], 0, { palette: BLACK }),
    place('kitchenCabinetDrawer', [0.33, -2.34], 0, { palette: BLACK }),
    place('kitchenSink', [0.975, -2.34], 0, { palette: BLACK }),
    place('kitchenCabinet', [1.62, -2.34], 0, { palette: BLACK }),
    place('kitchenCabinetDrawer', [2.265, -2.34], 0, { palette: BLACK }),
    place('kitchenCabinet', [2.91, -2.34], 0, { palette: BLACK }),
    place('kitchenCabinetUpper', [-2.25, -2.53], 0, { y: 1.55, palette: BLACK }),
    place('kitchenCabinetUpper', [-0.96, -2.53], 0, { y: 1.55, palette: BLACK }),
    place('kitchenCabinetUpper', [-0.315, -2.53], 0, { y: 1.55, palette: BLACK }),
    place('kitchenCabinetUpper', [2.265, -2.53], 0, { y: 1.55, palette: BLACK }),
    place('kitchenCabinetUpper', [2.91, -2.53], 0, { y: 1.55, palette: BLACK }),
    place('kitchenCoffeeMachine', [-0.315, -2.38], 0, { y: 0.68, slot: 'coffee' }),
    place('toaster', [-0.96, -2.38], 0, { y: 0.68, slot: 'toaster' }),
    place('kitchenMicrowave', [2.91, -2.38], 0, { y: 0.68, slot: 'microwave' }),
    place('kitchenBlender', [2.265, -2.4], 0, { y: 0.68, slot: 'blender' }),
    ...row('kitchenCabinet', 3, [-0.645, -0.25], [0.645, 0], 180, { palette: BLACK }),
    ...row('kitchenBar', 3, [-0.645, 0.25], [0.645, 0], 0, { palette: BLACK }),
    ...row('stoolBarSquare', 3, [-0.645, 0.78], [0.645, 0], 180, { slot: 'bar' }),
    place('washer', [-3.15, -0.6], 90, { slot: 'laundry' }),
    ...base('cooker', place('trashcan', [3.25, -1.6])),
    place('pottedPlant', [3.2, 2.3], 0, { scale: 1.2, slot: 'plants' }),
  ],
  props: [
    { kind: 'pot', at: [-1.605, -2.34], y: 0.68, r: 0.16, slot: 'cooker', base: true },
    { kind: 'food-plate', at: [0.0, -0.25], y: 0.68, food: 'jollof', slot: 'pantry' },
    { kind: 'food-plate', at: [0.645, -0.25], y: 0.68, food: 'suya', slot: 'pantry' },
    { kind: 'bottles', at: [-0.645, -0.25], y: 0.68, count: 2, slot: 'bar' },
    {
      kind: 'sign',
      at: [-3.48, -1.6],
      rot: 90,
      y: 1.7,
      wall: true,
      size: [0.9, 0.6],
      lines: ['TODAY', 'JOLLOF · DODO', 'PEPPER SOUP'],
      bg: '#263238',
      fg: '#ffffff',
      style: 'board',
      slot: 'art',
    },
    { kind: 'wall-clock', at: [-1.605, -2.68], y: 2.1, slot: 'clock' },
    { kind: 'water-dispenser', at: [-3.2, 2.2], slot: 'dispenser' },
  ],
  player: {
    default: stand([1.6, 1.4], 210),
    cook: stand([-1.605, -1.62], 180, 'cook'),
    eat: seat([0.0, 0.78], 180, 'eat', { y: 0.25 }),
  },
  npcs: [npc(stand([0.975, -1.62], 180, 'cook'), 'market', { gender: 'female' })],
  guests: [seat([0.645, 0.78], 180, 'talk', { y: 0.25 }), stand([2.2, 1.2], 220, 'talk')],
  lighting: {
    mood: 'home',
    practicals: [
      [-1.2, 2.8, -1.4],
      [0.0, 2.8, 0.3],
      [2.2, 2.8, -1.2],
    ],
  },
};

/** Upstairs in the mansion: a home cinema off the landing — recliners, a big screen, a minibar. */
export const MANSION_CINEMA: InteriorTemplate = {
  id: 'home-mansion:cinema',
  label: 'Cinema lounge',
  room: {
    width: 7.2,
    depth: 5.6,
    height: 3.0,
    floor: 'carpet',
    floorColor: '#3a2a3e',
    wall: { style: 'panel', color: '#2e2433' },
    doors: [{ wall: 'back', at: 2.2, width: 1.0 }],
  },
  furniture: [
    // All of it comes with the Home Cinema Room.
    ...row('loungeChairRelax', 3, [-1.0, 0.7], [1.0, 0], 180, {
      slot: 'cinema',
      palette: { carpet: '#7b1c1c', carpetDarker: '#5a1414' },
    }),
    ...slotted(
      'cinema',
      place('loungeDesignSofa', [0.0, 2.1], 180, { y: 0.18, palette: { carpetBlue: '#4a1f2e' } }),
      place('speaker', [-1.55, -2.55], 0, { palette: { wood: '#1c1c1c' } }),
      place('speaker', [1.55, -2.55], 0, { palette: { wood: '#1c1c1c' } }),
      place('kitchenFridgeSmall', [3.2, -2.55], 0),
      place('sideTable', [3.15, -1.5], -90, { palette: BLACK }),
    ),
  ],
  props: [
    { kind: 'stairwell', at: [-3.0, -1.3], size: [1.0, 2.6], color: '#5d4037', rail: '#c9a227' },
    {
      kind: 'sign',
      at: [0.0, -2.78],
      y: 1.55,
      wall: true,
      size: [2.8, 1.5],
      lines: ['NOLLYWOOD NIGHT', 'KING OF BOYS', 'NOW SHOWING'],
      bg: '#101010',
      fg: '#f6b90b',
      accent: '#ff2fb1',
      frame: '#1c1c1c',
      style: 'screen',
      slot: 'cinema',
    },
    { kind: 'stage', at: [0.0, 2.15], size: [3.4, 1.1], height: 0.18, color: '#2a1d2e', trim: '#c9a227', slot: 'cinema' },
    {
      kind: 'sign',
      at: [-3.58, 1.5],
      rot: 90,
      y: 1.6,
      wall: true,
      size: [0.8, 1.1],
      lines: ['KING', 'OF', 'BOYS'],
      bg: '#101010',
      fg: '#c9a227',
      accent: '#c62828',
      frame: '#c9a227',
      style: 'poster',
      slot: 'art',
    },
    { kind: 'bottles', at: [3.15, -1.5], y: 0.58, count: 3, slot: 'cinema' },
  ],
  player: {
    default: stand([2.0, 1.4], 210),
    sit: seat([0.0, 0.7], 180, 'sit', { y: 0.05 }),
  },
  npcs: [npc(seat([-1.0, 0.7], 180, 'sit', { y: 0.05 }), 'casual', { gender: 'female' })],
  guests: [seat([1.0, 0.7], 180, 'sit', { y: 0.05 }), seat([0.4, 2.1], 180, 'talk', { y: 0.2 })],
  lighting: {
    mood: 'home',
    practicals: [
      [0.0, 2.6, 1.2],
      [-2.2, 2.6, -0.6],
      [2.4, 2.6, -1.4],
    ],
    practicalColor: '#ffb27a',
  },
};

/** The mansion's master suite: a super-king bed, wardrobes, a study desk and an open en-suite with a bathtub. */
export const MANSION_MASTER: InteriorTemplate = {
  id: 'home-mansion:master',
  label: 'Master suite',
  room: {
    width: 8.0,
    depth: 6.0,
    height: 3.0,
    floor: 'wood',
    floorColor: '#7a5236',
    wall: { style: 'wallpaper', color: '#efe5d3' },
    windows: [{ wall: 'back', at: -0.6, width: 2.2, sill: 0.25, height: 2.4, bars: false }],
    doors: [{ wall: 'left', at: -1.6, width: 1.0 }],
    curtain: '#c9a227',
  },
  furniture: [
    place('bedDouble', [-2.96, 0.7], 90, {
      scale: 1.2,
      slot: 'bed',
      palette: { carpet: '#f4f0e8', carpetDarker: '#c9a227', carpetWhite: '#ffffff' },
    }),
    ...base(
      'bed',
      place('cabinetBedDrawer', [-3.75, -0.42], 90, { palette: BLACK }),
      place('cabinetBedDrawer', [-3.75, 1.82], 90, { palette: BLACK }),
      place('loungeSofaOttoman', [-1.55, 0.7], 90, { palette: { carpet: '#c9a227' } }),
    ),
    place('lampRoundTable', [-3.75, -0.42], 90, { y: 0.39, slot: 'lights' }),
    place('lampRoundTable', [-3.75, 1.82], 90, { y: 0.39, slot: 'lights' }),
    place('bookcaseClosedWide', [-3.25, -2.79], 0, {
      slot: 'storage',
      palette: { wood: '#3e2723', woodDark: '#2b1b15' },
    }),
    place('bookcaseClosedWide', [-2.05, -2.79], 0, {
      slot: 'storage',
      palette: { wood: '#3e2723', woodDark: '#2b1b15' },
    }),
    ...slotted('desk', place('desk', [3.0, -2.69], 0, { palette: BLACK }), place('chairDesk', [3.0, -2.05], 180)),
    place('laptop', [2.95, -2.75], 0, { y: 0.57, slot: 'laptop' }),
    place('books', [3.35, -2.8], 0, { y: 0.57, slot: 'books' }),
    place('bathtub', [2.7, 2.42]),
    place('shower', [3.5, 0.9]),
  ],
  props: [
    // The open en-suite: floor tiles and glass screen.
    { kind: 'mat', at: [2.75, 1.6], size: [2.5, 2.8], color: '#e8eef0', border: '#b0bec5', fixture: true },
    { kind: 'box', at: [1.45, 1.75], size: [0.05, 2.0, 1.9], color: '#bfe3f0', surface: 'gloss', round: 0.1, fixture: true },
    { kind: 'aircon', at: [-3.98, 0.7], rot: 90, y: 2.45, slot: 'ac' },
    { kind: 'mirror', at: [-3.98, -2.55], rot: 90, y: 1.2, size: [0.5, 1.3], frame: '#c9a227', slot: 'mirror' },
    {
      kind: 'sign',
      at: [1.45, -2.98],
      y: 1.7,
      wall: true,
      size: [0.8, 1.0],
      lines: ['EKO', 'AT', 'NIGHT'],
      bg: '#13212b',
      fg: '#f6b90b',
      accent: '#c9a227',
      frame: '#c9a227',
      style: 'poster',
      slot: 'art',
    },
  ],
  player: {
    default: stand([0.0, 0.6], 30),
    sleep: bed([-2.96, 0.7], 90, BED_TOP * 1.2),
    sit: seat([3.0, -2.05], 180, 'sit', { props: false }),
    type: seat([3.0, -2.05], 180, 'type', { props: false }),
    read: seat([3.0, -2.05], 180, 'read'),
    shower: stand([3.5, 0.9], 270, 'shower'),
  },
  npcs: [],
  guests: [stand([0.4, 1.2], 210, 'talk')],
  lighting: {
    mood: 'home',
    practicals: [
      [-2.0, 2.6, 0.7],
      [2.6, 2.6, 1.6],
      [1.0, 2.6, -1.6],
    ],
  },
};
