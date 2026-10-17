import type { PropSpec } from '../../props/prop-types';
import { place, seat, stand } from '../helpers';
import { slotted } from '../home-pieces';
import type { FurniturePlacement, InteriorTemplate } from '../types';

/**
 * Bathrooms (every home has one: toilet, a shower or a bucket bath) and the kitchens of the smaller homes. Their
 * fittings are part of the building (`furnish.ts` FIXTURES), so a home you rent always has somewhere to wash; the
 * cooker and the fridge are yours to buy, as everywhere. `layouts/catalog.ts` joins these rooms to the homes.
 */

interface BathroomOptions {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly floor: InteriorTemplate['room']['floor'];
  readonly floorColor: string;
  readonly wall: InteriorTemplate['room']['wall'];
  readonly curtain?: string;
  /** Lamps (a home's rooms all have as many). */
  readonly lamps: number;
  /** A bathtub between the basin and the shower (mansions). */
  readonly bathtub?: boolean;
  /** Buckets and a tray, no shower head (a face-me-I-face-you). */
  readonly bucketBath?: boolean;
}

/**
 * A bathroom: toilet, basin and mirror, and a shower stall (or a bucket bath) along the back wall, the door in the
 * left wall.
 */
function bathroom(o: BathroomOptions): InteriorTemplate {
  const { width: W, depth: D } = o;
  const back = -D / 2;
  const toiletX = -W / 2 + 1.05;
  const sinkX = toiletX + 0.95;
  const showerX = W / 2 - 0.75;
  const tubX = (sinkX + showerX) / 2 + 0.2;
  const furniture: FurniturePlacement[] = [
    place('toilet', [toiletX, back + 0.4]),
    place('bathroomSink', [sinkX, back + 0.25]),
    place('bathroomMirror', [sinkX, back + 0.06], 0, { y: 1.15 }),
  ];
  const props: PropSpec[] = [
    { kind: 'bucket', at: [W / 2 - 0.45, D / 2 - 0.45], color: '#1e88e5', slot: 'buckets' },
    { kind: 'wall-clock', at: [toiletX, back + 0.06], y: 1.95, slot: 'clock' },
  ];
  if (o.bucketBath) {
    props.push(
      // The wet floor: a slab, not a mat, so the bucket stays the thing you wash at.
      { kind: 'box', at: [showerX, back + 0.85], size: [1.3, 0.02, 1.4], color: '#b0bec5', surface: 'rubber', fixture: true },
      // A bucket of water and a scoop: the bath. It stands for a shower where the house has none.
      { kind: 'bucket', at: [showerX - 0.3, back + 0.8], color: '#e53935', fixture: true, thing: { kind: 'shower', name: 'Bucket bath' } },
      { kind: 'bucket', at: [showerX + 0.25, back + 1.05], color: '#43a047', fixture: true },
    );
  } else {
    furniture.push(place('shower', [showerX, back + 0.47]));
    props.push(
      { kind: 'mat', at: [showerX, back + 0.7], size: [1.2, 1.3], color: '#d7e3e8', border: '#90a4ae', fixture: true },
      { kind: 'box', at: [showerX - 0.62, back + 0.62], size: [0.05, 1.8, 1.1], color: '#bfe3f0', surface: 'gloss', round: 0.1, fixture: true },
    );
  }
  if (o.bathtub) furniture.push(place('bathtub', [tubX, back + 0.5]));
  const practicals: Array<readonly [number, number, number]> = Array.from({ length: o.lamps }, (_, i) => [(i - (o.lamps - 1) / 2) * 1.2, o.height - 0.3, 0.2 + i * 0.1]);
  return {
    id: o.id,
    label: o.label,
    room: {
      width: W,
      depth: D,
      height: o.height,
      floor: o.floor,
      floorColor: o.floorColor,
      wall: o.wall,
      windows: [{ wall: 'back', at: W / 2 - 0.75, width: 0.7, sill: 1.5, height: 0.5 }],
      doors: [{ wall: 'left', at: 0.5, width: 0.8 }],
      curtain: o.curtain,
    },
    furniture,
    props,
    player: {
      default: stand([0.2, 0.7], 200),
      shower: stand([showerX, back + (o.bucketBath ? 0.9 : 0.55)], 20, 'shower'),
    },
    npcs: [],
    guests: [stand([0.1, 0.6], 210, 'talk')],
    lighting: { mood: 'home', practicals },
  };
}

const TILED = { style: 'tiles', color: '#eef2ee', band: '#7fa99b' } as const;

/** A flat's bathroom, off the bedroom. */
export const FLAT_BATHROOM = bathroom({ id: 'home-flat:bathroom', label: 'Bathroom', width: 3.6, depth: 3.0, height: 2.6, floor: 'tiles', floorColor: '#d3d9d6', wall: TILED, lamps: 2 });

/** The duplex master bedroom's en-suite. */
export const DUPLEX_BATHROOM = bathroom({ id: 'home-duplex:bathroom', label: 'En-suite bathroom', width: 4.0, depth: 3.2, height: 2.9, floor: 'marble', floorColor: '#e6e1d8', wall: { style: 'tiles', color: '#f4efe6', band: '#8d6e63' }, curtain: '#7b2d3b', lamps: 3 });

/** The mansion master suite's marble en-suite: basin, bathtub and a walk-in shower. */
export const MANSION_BATHROOM = bathroom({ id: 'home-mansion:bathroom', label: 'Master bathroom', width: 5.6, depth: 3.6, height: 3.2, floor: 'marble', floorColor: '#eceae4', wall: { style: 'tiles', color: '#f7f5f0', band: '#2b2b2b' }, curtain: '#c9a227', lamps: 3, bathtub: true });

/** The family house's bathroom: a tiled box with a bucket for the days the water doesn't run. */
export const FAMILY_BATHROOM = bathroom({ id: 'home-family:bathroom', label: 'Bathroom', width: 3.4, depth: 3.0, height: 2.5, floor: 'tiles', floorColor: '#c9d2cf', wall: { style: 'tiles', color: '#e6eee9', band: '#4f8f7f' }, lamps: 2 });

/** The compound's shared bathroom behind a face-me-I-face-you: a toilet and a bucket bath. */
export const FACE_ME_BATHROOM = bathroom({ id: 'home-face-me:bathroom', label: 'Compound bathroom', width: 3.2, depth: 2.8, height: 2.4, floor: 'cement', floorColor: '#a9a59c', wall: { style: 'plaster', color: '#a9bfcb', band: '#6a8796' }, lamps: 1, bucketBath: true });

/** The hostel's shared bathroom at the end of the corridor. */
export const HOSTEL_BATHROOM = bathroom({ id: 'home-hostel:bathroom', label: 'Shared bathroom', width: 3.4, depth: 3.0, height: 2.6, floor: 'terrazzo', floorColor: '#c9c1b2', wall: { style: 'paint', color: '#e9e4c9', band: '#6b8f71' }, lamps: 1 });

/** The family kitchen: fridge, cooker and sink along the back, a table for meals. */
export const FAMILY_KITCHEN: InteriorTemplate = {
  id: 'home-family:kitchen',
  label: 'Kitchen',
  room: {
    width: 4.6,
    depth: 3.8,
    height: 2.5,
    floor: 'tiles',
    floorColor: '#d8d2c4',
    wall: { style: 'tiles', color: '#eef2ee', band: '#c0392b' },
    windows: [{ wall: 'back', at: 1.7, width: 0.9, sill: 1.15, height: 0.8 }],
    doors: [{ wall: 'left', at: 0.8, width: 0.9 }],
    curtain: '#d8a31d',
  },
  furniture: [
    place('kitchenFridge', [-1.9, -1.66], 0, { slot: 'fridge' }),
    place('kitchenCabinet', [-1.22, -1.54]),
    place('kitchenStove', [-0.575, -1.54], 0, { slot: 'cooker' }),
    place('kitchenSink', [0.07, -1.54]),
    place('kitchenCabinetDrawer', [0.715, -1.54]),
    place('kitchenCabinetUpper', [-1.22, -1.73], 0, { y: 1.35 }),
    place('kitchenCabinetUpper', [0.715, -1.73], 0, { y: 1.35 }),
    place('kitchenMicrowave', [0.715, -1.58], 0, { y: 0.68, slot: 'microwave' }),
    place('kitchenBlender', [-1.22, -1.6], 0, { y: 0.68, slot: 'blender' }),
    ...slotted(
      'dining',
      place('table', [1.2, 0.9], 0, { palette: { wood: '#b07a4a' } }),
      place('chairCushion', [1.2, 0.3], 0, { palette: { carpet: '#c0392b' } }),
      place('chairCushion', [0.45, 0.9], 90, { palette: { carpet: '#c0392b' } }),
      place('chairCushion', [1.95, 0.9], -90, { palette: { carpet: '#c0392b' } }),
    ),
    place('washer', [-1.98, -0.7], 90, { slot: 'laundry' }),
  ],
  props: [
    { kind: 'pot', at: [-0.575, -1.54], y: 0.68, r: 0.15, slot: 'cooker', base: true },
    { kind: 'food-plate', at: [1.2, 0.85], y: 0.5, food: 'jollof', slot: 'pantry' },
    { kind: 'sign', at: [-2.28, -0.9], rot: 90, y: 1.6, wall: true, size: [0.5, 0.42], lines: ['MAMA’S', 'KITCHEN'], bg: '#fff8e1', fg: '#6d4c41', accent: '#e65100', style: 'poster', slot: 'art' },
    { kind: 'wall-clock', at: [-0.575, -1.88], y: 1.85, slot: 'clock' },
    { kind: 'bucket', at: [1.9, -1.4], color: '#1e88e5', slot: 'buckets' },
  ],
  player: {
    default: stand([0.4, 0.2], 200),
    cook: stand([-0.575, -0.85], 180, 'cook'),
    eat: seat([1.2, 0.3], 0, 'eat'),
    sit: seat([1.2, 0.3], 0, 'sit'),
  },
  npcs: [],
  guests: [seat([0.45, 0.9], 90, 'talk'), stand([1.9, -0.4], 220, 'talk')],
  lighting: { mood: 'home', practicals: [[-0.4, 2.2, -0.6], [1.0, 2.2, 0.8]] },
};

/** The hostel's shared kitchenette down the corridor (the rooms themselves are strictly no cooking). */
export const HOSTEL_KITCHEN: InteriorTemplate = {
  id: 'home-hostel:kitchen',
  label: 'Shared kitchenette',
  room: {
    width: 3.8,
    depth: 3.2,
    height: 2.6,
    floor: 'terrazzo',
    floorColor: '#c9c1b2',
    wall: { style: 'paint', color: '#e9e4c9', band: '#6b8f71' },
    windows: [{ wall: 'back', at: 1.2, width: 0.8, sill: 1.15, height: 0.7 }],
    doors: [{ wall: 'left', at: 0.6, width: 0.9 }],
  },
  furniture: [
    place('kitchenCabinet', [-1.2, -1.24]),
    place('kitchenStove', [-0.555, -1.24], 0, { slot: 'cooker' }),
    place('kitchenSink', [0.09, -1.24]),
    place('kitchenCabinetDrawer', [0.735, -1.24]),
    place('kitchenCabinetUpper', [-1.2, -1.43], 0, { y: 1.35 }),
    place('kitchenFridgeSmall', [1.5, -1.3], 0, { slot: 'fridge' }),
  ],
  props: [
    { kind: 'pot', at: [-0.555, -1.24], y: 0.68, r: 0.15, slot: 'cooker', base: true },
    { kind: 'sign', at: [-1.88, -0.5], rot: 90, y: 1.65, wall: true, size: [0.7, 0.4], lines: ['WASH YOUR', 'PLATE'], bg: '#ffffff', fg: '#c62828', style: 'poster', fixture: true },
    { kind: 'bucket', at: [1.4, 1.1], color: '#1e88e5', slot: 'buckets' },
  ],
  player: {
    default: stand([0.3, 0.5], 200),
    cook: stand([-0.555, -0.55], 180, 'cook'),
  },
  npcs: [],
  guests: [stand([0.9, 0.7], 220, 'talk')],
  lighting: { mood: 'home', practicals: [[0.0, 2.3, -0.3]], practicalColor: '#f6fbff' },
};
