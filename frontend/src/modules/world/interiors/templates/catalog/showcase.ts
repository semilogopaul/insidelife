import type { AvatarClip } from '@/common/three/avatar';
import type { PropSpec } from '../../props/prop-types';
import { BED_TOP, bed, npc, place, row, seat, stand } from '../helpers';
import type { At, Deg, InteriorTemplate, Spot } from '../types';

/**
 * The showcase places, each a set of rooms joined by `layouts/catalog.ts`: OBO Mansion (a grand parlour, a cinema, a
 * games room, a kitchen, and upstairs an art gallery, a music studio and three bedrooms), the AIR OBO jet (cabin,
 * cockpit, lavatory) and the Dangote Refinery visitor centre (exhibition hall and viewing gallery). Every room of a
 * place has three practical lights and one lighting mood (no shader recompiles between rooms). Things you use are
 * named (`thing`) so their hotspots read "Snooker table", "Captain's seat", "Refinery model".
 */

const GOLD = '#c9a227';
const INK = '#141414';
const CREAM = '#f4f0e8';
const BLACK = { wood: '#1c1c1c', woodDark: '#111111' } as const;
const GOLD_SEAT = { carpetBlue: GOLD, carpet: GOLD, carpetDarker: '#8a6a12' } as const;
const CREAM_SEAT = { carpetBlue: CREAM, carpet: CREAM, carpetDarker: '#d9cfbd' } as const;

/** Standing to use something with your hands (no hand props): a cue at the snooker table, buttons on an arcade. */
const hands = (at: At, rot: Deg, animation: AvatarClip): Spot => ({ at, rot, animation, stance: 'stand', props: false });

/** A framed canvas on a wall (the owner's words, exactly as written), named so a hotspot can sit at it. */
function artwork(text: string, at: At, size: readonly [number, number], y: number, rot: Deg = 0, named = false): PropSpec {
  return {
    kind: 'sign',
    at,
    rot,
    y,
    wall: true,
    size,
    lines: [text],
    bg: '#101010',
    fg: GOLD,
    accent: GOLD,
    frame: GOLD,
    style: 'poster',
    ...(named ? { thing: { kind: 'exhibit' as const, name: `Artwork: ${text}` } } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// OBO Mansion — ground floor
// ---------------------------------------------------------------------------------------------------------------

/** The grand parlour (front door, grand stairs): a wall-sized TV, gold-and-cream sofas and the "shekpe" canvas. */
export const MANSION_PARLOUR: InteriorTemplate = {
  id: 'mansion',
  label: 'Grand parlour',
  room: {
    width: 14,
    depth: 10,
    height: 4.2,
    floor: 'marble',
    floorColor: '#f3efe8',
    wall: { style: 'paint', color: '#f7f4ee', band: '#e8dfcc' },
    windows: [{ wall: 'back', at: -5.4, width: 2.4, sill: 0.15, height: 3.6, bars: false }],
    doors: [
      { wall: 'left', at: 3.6, width: 1.8 },
      { wall: 'back', at: 5.6, width: 1.4 },
      { wall: 'left', at: -3.7, width: 1.4 },
      { wall: 'back', at: 0.9, width: 1.6 },
    ],
    curtain: GOLD,
  },
  furniture: [
    place('cabinetTelevision', [-2.3, -4.62], 0, { scale: 1.8, palette: BLACK }),
    place('televisionModern', [-2.3, -4.7], 0, { y: 0.84, scale: 2.4 }),
    place('loungeDesignSofa', [-3.3, -1.7], 180, { scale: 1.15, palette: CREAM_SEAT }),
    place('loungeDesignSofa', [-1.3, -1.7], 180, { scale: 1.15, palette: CREAM_SEAT }),
    place('loungeDesignChair', [-4.9, -3.0], 90, { palette: GOLD_SEAT }),
    place('tableCoffeeGlass', [-2.3, -3.0], 0, { scale: 1.3 }),
    place('rugRectangle', [-2.3, -2.6], 0, { scale: 2.2, palette: { carpet: CREAM, carpetDarker: GOLD } }),
    place('lampRoundFloor', [-0.2, -4.4], 0, { scale: 1.3 }),
    place('lampRoundFloor', [-4.4, -4.4], 0, { scale: 1.3 }),
    place('tree_palmShort', [6.2, -4.1], 0, { scale: 0.95 }),
    place('tree_palmShort', [-6.2, 4.3], 0, { scale: 0.8 }),
    place('pottedPlant', [4.6, 4.3], 0, { scale: 1.5 }),
    place('pottedPlant', [-0.6, 4.3], 0, { scale: 1.5 }),
    place('loungeSofaLong', [2.6, 3.6], 0, { palette: GOLD_SEAT }),
  ],
  props: [
    { kind: 'stairs', at: [-6.35, -0.6], rot: 180, size: [1.2, 4.2, 3.6], color: CREAM },
    { kind: 'chandelier', at: [-2.3, -2.6], height: 3.5 },
    { kind: 'chandelier', at: [2.6, 1.2], height: 3.5 },
    { kind: 'aquarium', at: [6.4, 0.6], rot: -90, size: [2.0, 1.0, 0.5] },
    artwork('shekpe', [3.3, -4.97], [2.4, 1.8], 1.2, 0, true),
    { kind: 'sign', at: [5.6, 1.6], rot: -70, size: [1.4, 1.0], lines: ['e choke'], bg: '#101010', fg: GOLD, accent: GOLD, frame: GOLD, style: 'poster', thing: { kind: 'exhibit', name: 'Artwork: e choke' } },
    artwork('tule jor', [-6.97, 1.95], [1.2, 1.0], 1.7, 90),
    { kind: 'box', at: [0, -4.97], y: 3.6, size: [13.8, 0.08, 0.04], color: GOLD, surface: 'metal' },
    { kind: 'mat', at: [-6.1, 3.6], size: [1.6, 2.0], color: '#f0e6cf', border: GOLD },
  ],
  player: {
    default: stand([1.5, 1.8], 210),
    sit: seat([-2.8, -1.7], 180),
    talk: seat([-4.9, -3.0], 90, 'talk'),
    phone: stand([3.3, -4.2], 0, 'phone'),
  },
  npcs: [
    npc(stand([-4.6, 4.3], 120, 'talk'), 'corporate', { gender: 'male' }),
    npc(seat([-3.8, -1.7], 180, 'phone'), 'club', { gender: 'female' }),
    npc(stand([5.4, -0.4], 250, 'talk'), 'casual', { lod: 'low' }),
  ],
  guests: [seat([-1.8, -1.7], 180), seat([-0.8, -1.7], 180, 'talk'), stand([0.6, 2.4], 200, 'talk')],
  lighting: { mood: 'home', practicals: [[-2.3, 3.8, -2.6], [2.6, 3.8, 1.2], [5.0, 3.6, -3.4]] },
};

/** The chef's kitchen: a long island with stools, black cabinets, double fridge, and the house chef at the stove. */
export const MANSION_KITCHEN: InteriorTemplate = {
  id: 'mansion:kitchen',
  label: 'Chef’s kitchen',
  room: {
    width: 9,
    depth: 6.4,
    height: 3.4,
    floor: 'marble',
    floorColor: '#ece6dc',
    wall: { style: 'tiles', color: '#f7f5f0', band: '#2b2b2b' },
    windows: [{ wall: 'back', at: 2.4, width: 2.4, sill: 1.05, height: 1.6, bars: false }],
    doors: [{ wall: 'left', at: 1.8, width: 1.4 }],
    curtain: GOLD,
  },
  furniture: [
    place('kitchenFridgeLarge', [-3.85, -2.88]),
    place('kitchenFridgeLarge', [-3.07, -2.88]),
    place('kitchenCabinetDrawer', [-2.36, -2.86], 0, { palette: BLACK }),
    place('kitchenStove', [-1.715, -2.86]),
    place('kitchenCabinet', [-1.07, -2.86], 0, { palette: BLACK }),
    place('kitchenSink', [-0.425, -2.86], 0, { palette: BLACK }),
    place('kitchenCabinetDrawer', [0.22, -2.86], 0, { palette: BLACK }),
    place('kitchenCabinet', [0.865, -2.86], 0, { palette: BLACK }),
    place('kitchenCabinetDrawer', [1.51, -2.86], 0, { palette: BLACK }),
    place('kitchenCabinet', [2.155, -2.86], 0, { palette: BLACK }),
    place('kitchenCabinetUpper', [-2.36, -3.05], 0, { y: 1.55, palette: BLACK }),
    place('kitchenCabinetUpper', [-1.07, -3.05], 0, { y: 1.55, palette: BLACK }),
    place('kitchenCoffeeMachine', [-1.07, -2.9], 0, { y: 0.68 }),
    place('kitchenMicrowave', [0.865, -2.9], 0, { y: 0.68 }),
    ...row('kitchenCabinet', 4, [-0.97, -0.4], [0.645, 0], 180, { palette: BLACK }),
    ...row('kitchenBar', 4, [-0.97, 0.1], [0.645, 0], 0, { palette: BLACK }),
    ...row('stoolBarSquare', 4, [-0.97, 0.66], [0.645, 0], 180),
    place('pottedPlant', [3.9, 2.6], 0, { scale: 1.3 }),
    place('pottedPlant', [3.9, -2.7], 0, { scale: 1.3 }),
  ],
  props: [
    { kind: 'pot', at: [-1.715, -2.86], y: 0.68, r: 0.18, color: GOLD },
    { kind: 'food-plate', at: [-0.65, -0.4], y: 0.68, food: 'jollof' },
    { kind: 'food-plate', at: [0.32, -0.4], y: 0.68, food: 'chicken' },
    { kind: 'food-plate', at: [0.97, -0.4], y: 0.68, food: 'small-chops' },
    { kind: 'bottles', at: [-0.32, -0.4], y: 0.68, count: 3 },
    {
      kind: 'sign',
      at: [-4.47, -0.6],
      rot: 90,
      y: 1.5,
      wall: true,
      size: [1.2, 0.8],
      lines: ['TODAY', 'PARTY JOLLOF · DODO', 'PEPPERED CHICKEN'],
      bg: '#263238',
      fg: '#ffffff',
      accent: GOLD,
      style: 'board',
    },
    { kind: 'chandelier', at: [0.0, -0.15], height: 2.7 },
  ],
  player: {
    default: stand([2.6, 1.8], 210),
    eat: seat([0.32, 0.66], 180, 'eat', { y: 0.25 }),
  },
  npcs: [npc(stand([-1.715, -2.15], 180, 'cook'), 'corporate', { gender: 'female' })],
  guests: [seat([-0.97, 0.66], 180, 'eat', { y: 0.25 }), stand([2.2, 0.6], 230, 'talk')],
  lighting: { mood: 'home', practicals: [[-1.6, 3.0, -1.6], [0.0, 3.0, 0.2], [2.4, 3.0, -1.4]] },
};

/** The games room: FIFA on a big screen, a gold-legged snooker table, arcade cabinets and a "tule jor" neon. */
export const MANSION_GAMES: InteriorTemplate = {
  id: 'mansion:games',
  label: 'Games room',
  room: {
    width: 10,
    depth: 8,
    height: 3.4,
    floor: 'wood',
    floorColor: '#3b2a20',
    wall: { style: 'panel', color: '#1c1f2b' },
    doors: [{ wall: 'left', at: 2.4, width: 1.4 }],
  },
  furniture: [
    place('cabinetTelevision', [-2.4, -3.62], 0, { scale: 1.6, palette: BLACK }),
    place('televisionModern', [-2.4, -3.68], 0, { y: 0.74, scale: 2.2 }),
    { ...place('loungeDesignSofa', [-2.4, -1.2], 180, { scale: 1.15, palette: { carpetBlue: '#7b1c1c' } }), thing: { kind: 'game', name: 'PS5 & FIFA' } },
    place('speaker', [-4.2, -3.6], 0, { palette: BLACK }),
    place('speaker', [-0.6, -3.6], 0, { palette: BLACK }),
    place('rugRectangle', [-2.4, -2.0], 0, { scale: 1.8, palette: { carpet: '#2b2f3a', carpetDarker: GOLD } }),
    place('stoolBar', [0.2, 1.6], 200),
    place('stoolBar', [3.6, 1.6], 160),
    place('pottedPlant', [-4.4, 3.4], 0, { scale: 1.3 }),
  ],
  props: [
    // Snooker table: a dark wood body on gold feet, green felt, the lamp over it.
    { kind: 'box', at: [2.0, -1.0], size: [2.2, 0.72, 1.1], color: '#2b1d16', surface: 'wood', thing: { kind: 'game', name: 'Snooker table' } },
    { kind: 'box', at: [2.0, -1.0], y: 0.72, size: [2.56, 0.08, 1.46], color: '#1f6f3a', surface: 'cloth' },
    { kind: 'box', at: [2.0, -1.0], y: 0.7, size: [2.64, 0.06, 1.54], color: GOLD, surface: 'metal' },
    { kind: 'box', at: [2.0, -1.0], y: 2.3, size: [1.6, 0.12, 0.34], color: GOLD, surface: 'metal' },
    // Arcade cabinets with lit screens.
    { kind: 'box', at: [3.6, -3.55], size: [0.8, 1.8, 0.7], color: '#1a1a2e', surface: 'gloss', thing: { kind: 'game', name: 'Arcade' } },
    { kind: 'box', at: [4.5, -3.55], size: [0.8, 1.8, 0.7], color: '#2b0f3a', surface: 'gloss' },
    { kind: 'sign', at: [3.6, -3.18], y: 1.05, wall: true, size: [0.6, 0.45], lines: ['HIGH SCORE', 'OBO 999,999'], bg: '#06121f', fg: '#46e0ff', accent: '#ff4fd8', style: 'screen' },
    { kind: 'sign', at: [4.5, -3.18], y: 1.05, wall: true, size: [0.6, 0.45], lines: ['INSERT COIN', 'FREE PLAY'], bg: '#1a0623', fg: '#ff4fd8', accent: '#f6b90b', style: 'screen' },
    { kind: 'sign', at: [-4.97, -1.0], rot: 90, y: 1.5, wall: true, size: [2.2, 0.8], lines: ['tule jor'], bg: '#0b0b0d', fg: '#ff4fd8', accent: '#46e0ff', style: 'screen' },
    { kind: 'sign', at: [1.4, -3.97], y: 1.6, wall: true, size: [1.4, 0.9], lines: ['OBO FC', 'WINNER STAYS ON'], bg: '#101010', fg: GOLD, accent: '#ffffff', frame: GOLD, style: 'poster' },
  ],
  player: {
    default: stand([1.0, 2.4], 210),
    sit: seat([-1.8, -1.2], 180),
    cook: hands([2.0, -0.05], 180, 'cook'),
    type: hands([3.6, -2.75], 180, 'type'),
  },
  npcs: [npc(seat([-3.0, -1.2], 180, 'sit'), 'campus', { gender: 'male' }), npc(stand([0.4, -0.6], 100, 'talk'), 'casual', { lod: 'low' })],
  guests: [stand([-1.0, 1.6], 200, 'talk'), stand([3.0, 0.8], 200, 'talk')],
  lighting: { mood: 'home', practicals: [[-2.4, 3.0, -1.6], [2.0, 3.0, -1.0], [3.8, 3.0, -3.0]], practicalColor: '#ffd29a' },
};

/** The home cinema: a cinema-sized screen, tiered recliners, a gold front-row couch and a free popcorn stand. */
export const MANSION_CINEMA: InteriorTemplate = {
  id: 'mansion:cinema',
  label: 'Cinema',
  room: {
    width: 11,
    depth: 8.6,
    height: 4.0,
    floor: 'carpet',
    floorColor: '#2a1018',
    wall: { style: 'panel', color: '#1a0f14' },
    doors: [{ wall: 'back', at: 4.6, width: 1.2 }],
  },
  furniture: [
    place('loungeDesignSofa', [-2.6, -1.0], -90, { scale: 1.15, palette: GOLD_SEAT }),
    place('loungeDesignSofa', [-2.6, 1.0], -90, { scale: 1.15, palette: GOLD_SEAT }),
    ...[-0.6, 1.4, 3.4].flatMap((x, tier) =>
      [-2.4, -1.4, -0.4, 0.6, 1.6].map((z) => place('loungeChairRelax', [x, z], -90, { y: 0.01 + tier * 0.13, palette: { carpet: '#7b1c1c', carpetDarker: '#5a1414' } })),
    ),
  ],
  props: [
    {
      kind: 'sign',
      at: [-5.42, 0.0],
      rot: 90,
      y: 0.8,
      wall: true,
      size: [6.6, 3.0],
      lines: ['OBO CINEMA', 'TONIGHT: A NOLLYWOOD PREMIERE', 'NOW SHOWING'],
      bg: '#0b0b0d',
      fg: GOLD,
      accent: '#ff2fb1',
      frame: '#1c1c1c',
      style: 'screen',
    },
    ...[-0.6, 1.4, 3.4].map((x, tier): PropSpec => ({ kind: 'stage', at: [x, -0.4], size: [1.8, 6.6], height: 0.01 + tier * 0.13, color: '#2a1520', trim: GOLD })),
    { kind: 'speaker-stack', at: [-4.9, -3.8], height: 1.8 },
    { kind: 'speaker-stack', at: [-4.9, 3.8], height: 1.8 },
    { kind: 'box', at: [4.6, 3.0], size: [0.9, 1.0, 0.6], color: '#c62828', surface: 'gloss' },
    { kind: 'sign', at: [4.6, 3.31], y: 1.05, wall: true, size: [0.9, 0.35], lines: ['POPCORN · CHAPMAN · FREE'], bg: GOLD, fg: '#7b1c1c' },
    { kind: 'box', at: [0, -4.27], y: 0.05, size: [10.8, 0.05, 0.04], color: GOLD, surface: 'metal' },
  ],
  player: {
    default: stand([4.6, -2.6], 240),
    sit: seat([1.4, 0.6], -90, 'sit', { y: 0.19 }),
  },
  npcs: [
    npc(seat([-0.6, -1.4], -90, 'sit', { y: 0.06 }), 'club', { gender: 'female' }),
    npc(seat([1.4, -2.4], -90, 'eat', { y: 0.19 }), 'casual', { lod: 'low' }),
    npc(seat([3.4, 1.6], -90, 'sit', { y: 0.32 }), 'campus', { lod: 'low' }),
  ],
  guests: [seat([1.4, -0.4], -90, 'sit', { y: 0.19 }), seat([-0.6, 1.6], -90, 'sit', { y: 0.06 })],
  lighting: { mood: 'home', practicals: [[1.4, 3.6, -3.4], [1.4, 3.6, 3.4], [4.4, 3.6, 0.0]], practicalColor: '#ffb27a' },
};

// ---------------------------------------------------------------------------------------------------------------
// OBO Mansion — upstairs
// ---------------------------------------------------------------------------------------------------------------

/** The upstairs landing is a gallery: "shekpe", "e choke" and "tule jor" in gold, plinths, doors to every suite. */
export const MANSION_GALLERY: InteriorTemplate = {
  id: 'mansion:gallery',
  label: 'Art gallery',
  room: {
    width: 12,
    depth: 7,
    height: 3.4,
    floor: 'marble',
    floorColor: '#f3efe8',
    wall: { style: 'paint', color: '#fbfaf7' },
    doors: [
      { wall: 'back', at: -2.2, width: 1.2 },
      { wall: 'back', at: 1.4, width: 1.2 },
      { wall: 'back', at: 4.6, width: 1.1 },
      { wall: 'left', at: 2.5, width: 1.1 },
    ],
  },
  furniture: [place('tree_palmShort', [5.2, 2.8], 0, { scale: 0.8 }), place('pottedPlant', [-4.2, 3.0], 0, { scale: 1.4 })],
  props: [
    { kind: 'stairwell', at: [-5.0, -1.5], size: [1.2, 3.4], color: CREAM, rail: GOLD },
    artwork('shekpe', [-0.4, -3.47], [2.0, 1.5], 1.0, 0, true),
    artwork('e choke', [3.0, -3.47], [1.6, 1.2], 1.1),
    artwork('tule jor', [-5.97, -1.5], [2.4, 1.3], 1.2, 90),
    { kind: 'pillar', at: [0.2, 1.3], height: 1.0, color: '#fbfaf7' },
    { kind: 'box', at: [0.2, 1.3], y: 1.0, size: [0.32, 0.55, 0.32], color: GOLD, surface: 'metal', round: 0.12 },
    { kind: 'pillar', at: [3.6, 1.3], height: 1.0, color: '#fbfaf7' },
    { kind: 'box', at: [3.6, 1.3], y: 1.0, size: [0.26, 0.7, 0.26], color: INK, surface: 'gloss', round: 0.1 },
    { kind: 'bench', at: [-0.4, -1.4], length: 1.8, color: INK },
  ],
  player: {
    default: stand([1.6, 2.2], 210),
    walk: stand([-0.4, -2.6], 180, 'walk'),
  },
  npcs: [npc(stand([3.0, -2.5], 180, 'phone'), 'club', { gender: 'female' })],
  guests: [stand([-2.4, 1.9], 200, 'talk'), stand([2.0, -0.6], 160, 'talk')],
  lighting: { mood: 'home', practicals: [[-0.4, 3.1, -2.0], [3.0, 3.1, -2.0], [1.6, 3.1, 1.6]] },
};

/** The music studio: mixing desk and monitors, the producer's couch and a glass vocal booth with the mic. */
export const MANSION_STUDIO: InteriorTemplate = {
  id: 'mansion:studio',
  label: 'Music studio',
  room: {
    width: 9,
    depth: 7,
    height: 3.2,
    floor: 'wood',
    floorColor: '#2b211b',
    wall: { style: 'panel', color: '#1f2229' },
    doors: [{ wall: 'left', at: 2.2, width: 1.1 }],
  },
  furniture: [
    { ...place('desk', [-1.55, -2.9], 0, { palette: BLACK }), thing: { kind: 'studio', name: 'Mixing desk' } },
    place('desk', [-0.45, -2.9], 0, { palette: BLACK }),
    place('computerScreen', [-1.75, -3.0], 0, { y: 0.58 }),
    place('computerScreen', [-1.0, -3.0], 0, { y: 0.58 }),
    place('computerScreen', [-0.25, -3.0], 0, { y: 0.58 }),
    place('computerKeyboard', [-1.0, -2.75], 0, { y: 0.58 }),
    place('chairDesk', [-1.0, -2.2], 180),
    place('speaker', [-2.6, -3.0], 0, { palette: BLACK }),
    place('speaker', [0.6, -3.0], 0, { palette: BLACK }),
    { ...place('loungeDesignSofa', [-1.0, -0.4], 180, { scale: 1.1, palette: { carpetBlue: '#3b2f4a' } }), thing: { kind: 'sofa', name: 'Producer’s couch' } },
    place('rugRound', [-1.0, -1.3], 0, { scale: 2.2, palette: { carpet: '#2b2f3a' } }),
  ],
  props: [
    // The vocal booth: glass on two sides, foam on the wall, the mic on its stand.
    { kind: 'box', at: [2.6, -0.6], size: [2.0, 2.4, 0.06], color: '#bfe3f0', surface: 'gloss' },
    { kind: 'box', at: [1.6, -2.05], size: [0.06, 2.4, 2.9], color: '#bfe3f0', surface: 'gloss' },
    { kind: 'box', at: [3.05, -3.46], y: 0.6, size: [2.8, 1.6, 0.06], color: '#3a3a3a', surface: 'cloth' },
    { kind: 'box', at: [3.0, -2.2], size: [0.05, 1.45, 0.05], color: INK, surface: 'metal', thing: { kind: 'studio', name: 'Vocal booth mic' } },
    { kind: 'box', at: [3.0, -2.2], y: 1.45, size: [0.12, 0.18, 0.12], color: '#9e9e9e', surface: 'metal', round: 0.05 },
    { kind: 'sign', at: [-1.0, -3.47], y: 1.9, wall: true, size: [2.0, 0.6], lines: ['e choke'], bg: '#0b0b0d', fg: GOLD, accent: '#ff4fd8', style: 'screen' },
    { kind: 'sign', at: [-4.47, -1.6], rot: 90, y: 1.3, wall: true, size: [0.7, 0.9], lines: ['PLATINUM'], bg: '#101010', fg: '#e5e4e2', accent: GOLD, frame: GOLD, style: 'poster' },
    { kind: 'sign', at: [-4.47, -0.6], rot: 90, y: 1.3, wall: true, size: [0.7, 0.9], lines: ['GOLD'], bg: '#101010', fg: GOLD, accent: GOLD, frame: GOLD, style: 'poster' },
  ],
  player: {
    default: stand([0.8, 1.6], 210),
    sit: seat([-0.6, -0.4], 180),
    talk: stand([3.0, -1.6], 180, 'talk'),
  },
  npcs: [npc(seat([-1.0, -2.2], 180, 'type', { props: false }), 'street', { gender: 'male' })],
  guests: [seat([-1.45, -0.4], 180, 'talk'), stand([0.4, 1.2], 210, 'talk')],
  lighting: { mood: 'home', practicals: [[-1.0, 2.9, -1.6], [3.0, 2.9, -2.0], [0.8, 2.9, 1.6]], practicalColor: '#c9a2ff' },
};

/** OBO's master suite: an oversized bed under "tule jor", wardrobes and a reading chair by the window. */
export const MANSION_MASTER: InteriorTemplate = {
  id: 'mansion:master',
  label: 'Master suite',
  room: {
    width: 9,
    depth: 7,
    height: 3.2,
    floor: 'wood',
    floorColor: '#7a5236',
    wall: { style: 'wallpaper', color: '#efe5d3' },
    windows: [{ wall: 'back', at: 2.6, width: 2.2, sill: 0.25, height: 2.4, bars: false }],
    doors: [{ wall: 'left', at: 2.3, width: 1.1 }],
    curtain: GOLD,
  },
  furniture: [
    { ...place('bedDouble', [-1.2, -1.9], 0, { scale: 1.35, palette: { carpet: CREAM, carpetDarker: GOLD, carpetWhite: '#ffffff' } }), thing: { kind: 'bed', name: 'OBO’s bed' } },
    place('cabinetBedDrawer', [-2.6, -3.05], 0, { palette: BLACK }),
    place('cabinetBedDrawer', [0.2, -3.05], 0, { palette: BLACK }),
    place('lampRoundTable', [-2.6, -3.05], 0, { y: 0.39 }),
    place('lampRoundTable', [0.2, -3.05], 0, { y: 0.39 }),
    place('loungeSofaOttoman', [-1.2, -0.3], 0, { scale: 1.2, palette: { carpet: GOLD } }),
    place('bookcaseClosedWide', [-4.3, -2.2], 90, { palette: { wood: '#3e2723', woodDark: '#2b1b15' } }),
    place('bookcaseClosedWide', [-4.3, -1.0], 90, { palette: { wood: '#3e2723', woodDark: '#2b1b15' } }),
    place('loungeChairRelax', [3.4, -1.4], -120, { palette: CREAM_SEAT }),
    place('rugRectangle', [-1.2, -1.2], 0, { scale: 2.0, palette: { carpet: CREAM, carpetDarker: GOLD } }),
  ],
  props: [
    artwork('tule jor', [-1.2, -3.47], [1.8, 0.9], 1.45),
    { kind: 'chandelier', at: [-1.2, -1.6], height: 2.5 },
    { kind: 'mirror', at: [-4.47, 0.6], rot: 90, y: 0.4, size: [0.7, 1.7], frame: GOLD },
  ],
  player: {
    default: stand([1.0, 1.0], 210),
    sleep: bed([-1.2, -1.9], 0, BED_TOP * 1.35),
  },
  npcs: [],
  guests: [stand([1.8, 0.8], 210, 'talk')],
  lighting: { mood: 'home', practicals: [[-1.2, 2.9, -1.4], [2.6, 2.9, -1.6], [1.0, 2.9, 1.6]] },
};

/** A guest suite with its own rain shower behind glass. */
export const MANSION_GUEST: InteriorTemplate = {
  id: 'mansion:guest',
  label: 'Guest suite',
  room: {
    width: 7.6,
    depth: 6,
    height: 3.2,
    floor: 'marble',
    floorColor: '#efe9df',
    wall: { style: 'paint', color: '#e9eef0' },
    windows: [{ wall: 'back', at: -1.2, width: 1.6, sill: 0.6, height: 1.8, bars: false }],
    doors: [{ wall: 'left', at: 1.7, width: 1.0 }],
    curtain: '#9fb7c2',
  },
  furniture: [
    place('bedDouble', [-1.9, -1.5], 0, { scale: 1.1, palette: { carpet: '#e9eef0', carpetDarker: '#5f7f8c', carpetWhite: '#ffffff' } }),
    place('cabinetBedDrawer', [-3.2, -2.7], 0, { palette: BLACK }),
    place('shower', [3.1, -2.55]),
    place('bathroomSink', [1.8, -2.78]),
    place('bathroomMirror', [1.8, -2.95], 0, { y: 1.1 }),
    place('pottedPlant', [0.5, 2.5], 0, { scale: 1.3 }),
  ],
  props: [
    { kind: 'mat', at: [2.55, -2.2], size: [2.3, 1.6], color: '#e8eef0', border: '#b0bec5' },
    { kind: 'box', at: [2.0, -2.2], size: [0.05, 2.0, 1.6], color: '#bfe3f0', surface: 'gloss', round: 0.1 },
    artwork('e choke', [-0.1, -2.97], [1.0, 0.8], 1.5),
  ],
  player: {
    default: stand([0.4, 1.2], 210),
    shower: stand([3.1, -2.55], 180, 'shower'),
  },
  npcs: [],
  guests: [stand([-0.6, 1.4], 200, 'talk')],
  lighting: { mood: 'home', practicals: [[-1.9, 2.9, -1.2], [2.8, 2.9, -2.0], [0.4, 2.9, 1.4]] },
};

/** The second guest suite doubles as the walk-in closet: rails of jackets, chains on show, a full-length mirror. */
export const MANSION_CLOSET: InteriorTemplate = {
  id: 'mansion:closet',
  label: 'Guest suite & closet',
  room: {
    width: 7.6,
    depth: 6,
    height: 3.2,
    floor: 'carpet',
    floorColor: '#d8cfc0',
    wall: { style: 'wallpaper', color: '#f1e9da' },
    doors: [{ wall: 'left', at: 1.7, width: 1.0 }],
  },
  furniture: [
    place('bedDouble', [-2.0, -1.6], 0, { scale: 1.1, palette: { carpet: CREAM, carpetDarker: '#2b2b2b', carpetWhite: '#ffffff' } }),
    place('cabinetBedDrawer', [-3.3, -2.75], 0, { palette: BLACK }),
    place('loungeSofaOttoman', [0.9, 0.2], 0, { palette: { carpet: GOLD } }),
  ],
  props: [
    { kind: 'shelf', at: [2.2, -2.7], size: [2.4, 1.8, 0.5], items: 'clothes', color: INK },
    { kind: 'shelf', at: [3.5, -0.4], rot: -90, size: [1.8, 1.8, 0.5], items: 'clothes', color: INK },
    { kind: 'box', at: [0.6, -2.75], size: [0.8, 1.0, 0.45], color: INK, surface: 'gloss' },
    { kind: 'box', at: [0.6, -2.75], y: 1.0, size: [0.7, 0.04, 0.38], color: GOLD, surface: 'metal' },
    { kind: 'mirror', at: [-0.4, -2.97], y: 0.3, size: [0.7, 1.7], frame: GOLD },
    artwork('shekpe', [-2.0, -2.97], [1.4, 0.8], 1.6),
  ],
  player: {
    default: stand([0.4, 1.6], 210),
    wave: stand([2.2, -1.9], 180, 'wave'),
  },
  npcs: [],
  guests: [stand([-0.8, 1.2], 200, 'talk')],
  lighting: { mood: 'home', practicals: [[-2.0, 2.9, -1.2], [2.4, 2.9, -1.8], [0.4, 2.9, 1.4]] },
};

// ---------------------------------------------------------------------------------------------------------------
// AIR OBO
// ---------------------------------------------------------------------------------------------------------------

const JET_WALL = { style: 'panel', color: '#f3ede2', band: '#d9cdb5' } as const;
const JET_LIGHT = '#ffe2b0';

/** The jet's cabin (the airstair door aft of the cockpit): cream club seats round walnut tables, gold rails. */
export const JET_CABIN: InteriorTemplate = {
  id: 'private-jet',
  label: 'Cabin',
  room: {
    width: 9.6,
    depth: 2.8,
    height: 2.3,
    floor: 'carpet',
    floorColor: '#cbbfa6',
    wall: JET_WALL,
    windows: [-2.2, -1.0, 0.2, 1.4, 2.6].map((at) => ({ wall: 'back' as const, at, width: 0.42, sill: 0.8, height: 0.5, bars: false })),
    doors: [
      { wall: 'back', at: -3.6, width: 0.9 },
      { wall: 'left', at: 0.5, width: 0.8 },
      { wall: 'back', at: 4.1, width: 0.8 },
    ],
  },
  furniture: [
    place('loungeChair', [-2.2, -0.75], 90, { palette: CREAM_SEAT }),
    place('loungeChair', [-0.6, -0.75], -90, { palette: CREAM_SEAT }),
    place('loungeChair', [0.6, -0.75], 90, { palette: CREAM_SEAT }),
    place('loungeChair', [2.2, -0.75], -90, { palette: CREAM_SEAT }),
  ],
  props: [
    { kind: 'box', at: [-1.4, -0.85], size: [0.55, 0.7, 0.5], color: '#5d3a1a', surface: 'wood', round: 0.04 },
    { kind: 'box', at: [1.4, -0.85], size: [0.55, 0.7, 0.5], color: '#5d3a1a', surface: 'wood', round: 0.04 },
    { kind: 'bottles', at: [1.4, -0.85], y: 0.7, count: 2, colors: ['#e8d9a8', '#e8d9a8'] },
    // The galley: a walnut cabinet with champagne on top.
    { kind: 'box', at: [-4.4, -0.9], size: [0.7, 1.0, 0.5], color: '#4a2c14', surface: 'wood' },
    { kind: 'bottles', at: [-4.4, -0.9], y: 1.0, count: 3, colors: ['#1b3b2a', '#e8d9a8', '#1b3b2a'] },
    { kind: 'box', at: [0, -1.37], y: 0.78, size: [9.4, 0.04, 0.04], color: GOLD, surface: 'metal' },
    { kind: 'box', at: [0, -1.37], y: 1.45, size: [9.4, 0.03, 0.03], color: GOLD, surface: 'metal' },
    { kind: 'sign', at: [-4.78, -0.7], rot: 90, y: 1.3, wall: true, size: [1.0, 0.35], lines: ['AIR OBO'], bg: INK, fg: GOLD, accent: GOLD, style: 'painted' },
  ],
  player: {
    default: stand([-1.4, 0.8], 120),
    sit: seat([-0.6, -0.75], -90),
    drink: seat([0.6, -0.75], 90, 'drink'),
  },
  npcs: [npc(stand([3.4, 0.7], 270, 'talk'), 'corporate', { gender: 'female' })],
  guests: [seat([-2.2, -0.75], 90), seat([2.2, -0.75], -90, 'talk')],
  lighting: { mood: 'home', practicals: [[-2.6, 2.1, 0.2], [0.0, 2.1, 0.2], [2.6, 2.1, 0.2]], practicalColor: JET_LIGHT },
};

/** The cockpit: two cream pilot seats, yokes, glass displays and the windscreen. Nothing here starts an engine. */
export const JET_COCKPIT: InteriorTemplate = {
  id: 'private-jet:cockpit',
  label: 'Cockpit',
  room: {
    width: 2.8,
    depth: 2.6,
    height: 2.1,
    floor: 'dark',
    floorColor: '#2b2f36',
    wall: { style: 'panel', color: '#3a3f47' },
    windows: [
      { wall: 'left', at: -0.55, width: 0.9, sill: 1.0, height: 0.6, bars: false },
      { wall: 'left', at: 0.55, width: 0.9, sill: 1.0, height: 0.6, bars: false },
    ],
    doors: [{ wall: 'back', at: 0.8, width: 0.7 }],
  },
  furniture: [
    { ...place('loungeChair', [-0.45, 0.55], -90, { palette: CREAM_SEAT }), thing: { kind: 'chair', name: 'Captain’s seat' } },
    { ...place('loungeChair', [-0.45, -0.55], -90, { palette: CREAM_SEAT }), thing: { kind: 'chair', name: 'Co-pilot seat' } },
  ],
  props: [
    { kind: 'box', at: [-1.15, 0], size: [0.45, 0.95, 2.5], color: '#22262c', surface: 'metal' },
    { kind: 'sign', at: [-0.92, 0.55], rot: 90, y: 0.6, wall: true, size: [0.5, 0.28], lines: ['FL 410', 'GROUND · PARKED'], bg: '#06121f', fg: '#46e0ff', accent: '#7cffb2', style: 'screen' },
    { kind: 'sign', at: [-0.92, -0.55], rot: 90, y: 0.6, wall: true, size: [0.5, 0.28], lines: ['AIR OBO', 'LOS · DNMM'], bg: '#06121f', fg: '#46e0ff', accent: GOLD, style: 'screen' },
    { kind: 'box', at: [-0.78, 0.55], y: 0.5, size: [0.05, 0.25, 0.32], color: INK, surface: 'metal' },
    { kind: 'box', at: [-0.78, -0.55], y: 0.5, size: [0.05, 0.25, 0.32], color: INK, surface: 'metal' },
    { kind: 'box', at: [0.2, -1.27], y: 1.4, size: [1.6, 0.3, 0.04], color: '#22262c', surface: 'metal' },
  ],
  player: {
    default: stand([0.7, 0.2], 270),
    drive: seat([-0.45, 0.55], -90, 'drive', { y: 0.02 }),
    phone: seat([-0.45, -0.55], -90, 'phone', { y: 0.02 }),
  },
  npcs: [],
  guests: [stand([0.9, -0.7], 250, 'talk')],
  lighting: { mood: 'home', practicals: [[-0.2, 1.9, 0.0], [0.6, 1.9, -0.6], [0.6, 1.9, 0.6]], practicalColor: JET_LIGHT },
};

/** The lavatory: marble, a gold-trimmed sink and mirror, and the toilet. */
export const JET_LAVATORY: InteriorTemplate = {
  id: 'private-jet:lavatory',
  label: 'Lavatory',
  room: {
    width: 2.2,
    depth: 2.0,
    height: 2.1,
    floor: 'marble',
    floorColor: '#efe9df',
    wall: { style: 'tiles', color: '#f4efe6', band: GOLD },
    windows: [{ wall: 'back', at: 0.45, width: 0.3, sill: 1.3, height: 0.35, bars: false }],
    doors: [{ wall: 'left', at: 0.35, width: 0.7 }],
  },
  furniture: [
    place('toilet', [0.45, -0.62]),
    place('bathroomSink', [-0.5, -0.78]),
    place('bathroomMirror', [-0.5, -0.95], 0, { y: 1.1 }),
  ],
  props: [{ kind: 'box', at: [0, -0.98], y: 0.92, size: [2.1, 0.04, 0.04], color: GOLD, surface: 'metal' }],
  player: {
    default: stand([0.2, 0.55], 30),
    sit: seat([0.45, -0.62], 0, 'sit', { y: 0.06, props: false }),
  },
  npcs: [],
  guests: [stand([0.75, 0.55], 300, 'talk')],
  lighting: { mood: 'home', practicals: [[0.0, 1.9, 0.0], [-0.5, 1.9, -0.5], [0.5, 1.9, 0.3]], practicalColor: JET_LIGHT },
};

// ---------------------------------------------------------------------------------------------------------------
// Dangote Refinery
// ---------------------------------------------------------------------------------------------------------------

const DANGOTE_BLUE = '#1d4f91';

/** The visitor centre: reception, the refinery scale model, a video wall and the gift shop. */
export const REFINERY_CENTRE: InteriorTemplate = {
  id: 'refinery',
  label: 'Visitor centre',
  room: {
    width: 13,
    depth: 9,
    height: 4.0,
    floor: 'terrazzo',
    floorColor: '#d9d6cf',
    wall: { style: 'paint', color: '#f2f2ee', band: DANGOTE_BLUE },
    windows: [{ wall: 'back', at: -3.6, width: 3.2, sill: 0.3, height: 2.8, bars: false }],
    doors: [
      { wall: 'left', at: 2.8, width: 1.8 },
      { wall: 'back', at: 4.8, width: 1.6 },
    ],
  },
  furniture: [
    place('desk', [-4.6, 0.2], 90, { scale: 1.3, palette: { wood: DANGOTE_BLUE, woodDark: '#123561' } }),
    place('chairDesk', [-5.25, 0.2], 90),
    place('computerScreen', [-4.6, 0.2], -90, { y: 0.75 }),
    place('pottedPlant', [-6.0, -4.0], 0, { scale: 1.4 }),
    place('pottedPlant', [6.0, -4.0], 0, { scale: 1.4 }),
  ],
  props: [
    // The scale model: tank farm, columns, flare, on a dark plinth.
    { kind: 'box', at: [0.0, -0.4], size: [3.4, 0.8, 2.0], color: '#2b2f36', surface: 'metal', thing: { kind: 'exhibit', name: 'Refinery model' } },
    { kind: 'box', at: [0.0, -0.4], y: 0.8, size: [3.3, 0.04, 1.9], color: '#7a8a5a', surface: 'paint' },
    ...([[-1.2, -0.9], [-0.7, -0.9], [-1.2, -0.35], [-0.7, -0.35], [-1.2, 0.2]] as const).map((at): PropSpec => ({ kind: 'box', at, y: 0.84, size: [0.38, 0.22, 0.38], color: '#f2f2ee', surface: 'paint', round: 0.17 })),
    { kind: 'box', at: [0.4, -0.7], y: 0.84, size: [0.16, 0.95, 0.16], color: '#b0b7bf', surface: 'metal', round: 0.07 },
    { kind: 'box', at: [0.75, -0.6], y: 0.84, size: [0.12, 0.75, 0.12], color: '#b0b7bf', surface: 'metal', round: 0.05 },
    { kind: 'box', at: [0.6, 0.1], y: 0.84, size: [1.4, 0.04, 0.08], color: '#8a9199', surface: 'metal' },
    { kind: 'box', at: [1.4, -1.0], y: 0.84, size: [0.05, 1.1, 0.05], color: '#b0b7bf', surface: 'metal' },
    { kind: 'box', at: [1.4, -1.0], y: 1.94, size: [0.1, 0.16, 0.1], color: '#ff7a1a', surface: 'gloss' },
    {
      kind: 'sign',
      at: [1.8, -4.47],
      y: 1.3,
      wall: true,
      size: [3.2, 1.8],
      lines: ['DANGOTE PETROLEUM REFINERY', '650,000 BARRELS A DAY', 'CRUDE IN · PETROL, DIESEL, JET FUEL OUT'],
      bg: '#06121f',
      fg: '#ffffff',
      accent: '#46e0ff',
      style: 'screen',
      thing: { kind: 'exhibit', name: 'Video wall' },
    },
    { kind: 'sign', at: [-6.47, -2.2], rot: 90, y: 1.8, wall: true, size: [3.0, 1.0], lines: ['DANGOTE'], bg: DANGOTE_BLUE, fg: '#ffffff', accent: '#e23b2e', style: 'painted' },
    { kind: 'shelf', at: [3.0, 2.2], size: [1.8, 1.6, 0.5], items: 'boxes', color: DANGOTE_BLUE, thing: { kind: 'shelf', name: 'Gift shop' } },
    { kind: 'shelf', at: [5.0, 2.2], size: [1.6, 1.6, 0.5], items: 'clothes', color: DANGOTE_BLUE, thing: { kind: 'shelf', name: 'Gift shop' } },
    { kind: 'bench', at: [-1.0, 2.8], length: 2.0, color: '#8a9199' },
  ],
  player: {
    default: stand([-2.6, 3.2], 30),
    read: hands([0.0, 0.95], 180, 'read'),
  },
  npcs: [
    npc(seat([-5.25, 0.2], 90, 'type', { props: false }), 'corporate', { gender: 'female' }),
    npc(stand([-2.1, 0.9], 120, 'talk'), 'corporate', { gender: 'male' }),
    npc(stand([6.0, 3.4], 270, 'talk'), 'casual', { gender: 'female', lod: 'low' }),
  ],
  guests: [stand([2.4, 0.9], 200, 'talk'), seat([-1.6, 2.8], 0, 'sit')],
  lighting: { mood: 'office', practicals: [[0.0, 3.6, -0.4], [-4.0, 3.6, 1.0], [4.0, 3.6, 1.6]] },
};

/** The viewing gallery: a glass wall over the tank farm and flares, a long bench, telescopes, tour notices. */
export const REFINERY_GALLERY: InteriorTemplate = {
  id: 'refinery:gallery',
  label: 'Viewing gallery',
  room: {
    width: 12,
    depth: 6,
    height: 3.6,
    floor: 'terrazzo',
    floorColor: '#d9d6cf',
    wall: { style: 'paint', color: '#f2f2ee', band: DANGOTE_BLUE },
    windows: [-3.6, 0, 3.6].map((at) => ({ wall: 'back' as const, at, width: 3.2, sill: 0.4, height: 2.8, bars: false })),
    doors: [{ wall: 'left', at: 1.5, width: 1.4 }],
  },
  furniture: [place('pottedPlant', [5.4, 2.4], 0, { scale: 1.4 })],
  props: [
    { kind: 'bench', at: [0.0, -1.2], rot: 180, length: 2.6, color: '#8a9199' },
    { kind: 'pillar', at: [3.6, -2.3], height: 1.1, color: '#2b2f36', thing: { kind: 'exhibit', name: 'Viewing telescope' } },
    { kind: 'box', at: [3.6, -2.3], y: 1.1, size: [0.2, 0.2, 0.45], color: '#f6b90b', surface: 'gloss', round: 0.06 },
    { kind: 'pillar', at: [-3.6, -2.3], height: 1.1, color: '#2b2f36' },
    { kind: 'box', at: [-3.6, -2.3], y: 1.1, size: [0.2, 0.2, 0.45], color: '#f6b90b', surface: 'gloss', round: 0.06 },
    { kind: 'sign', at: [-5.97, -1.0], rot: 90, y: 1.4, wall: true, size: [2.4, 0.9], lines: ['GUIDED TOURS', 'HARD HATS ON · NO SMOKING'], bg: '#f6b90b', fg: '#0e2733', style: 'painted' },
    { kind: 'box', at: [-5.3, 2.4], size: [1.0, 0.8, 0.4], color: '#8a9199', surface: 'metal' },
    ...([-5.6, -5.3, -5.0] as const).map((x): PropSpec => ({ kind: 'box', at: [x, 2.4], y: 0.8, size: [0.26, 0.16, 0.3], color: '#f6b90b', surface: 'gloss', round: 0.1 })),
  ],
  player: {
    default: stand([-1.5, 1.4], 160),
    sit: seat([0.0, -1.2], 180),
    walk: stand([3.6, -1.6], 180, 'walk'),
  },
  npcs: [npc(stand([2.0, 0.6], 200, 'talk'), 'corporate', { gender: 'male' })],
  guests: [stand([-2.4, 0.8], 200, 'talk'), seat([-0.8, -1.2], 180)],
  lighting: { mood: 'office', practicals: [[-3.6, 3.3, 0.0], [0.0, 3.3, 0.0], [3.6, 3.3, 0.0]] },
};
