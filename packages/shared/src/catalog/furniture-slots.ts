/* Generated from the 3D home templates by frontend/.../interiors/tests/write-home-tables.test.ts (kept in sync by tests/home-data.test.ts). Do not edit by hand. */
import type { FurnitureSlot } from './furniture.js';

/** Where the template's own piece of each movable slot stood: [x, z, turn] (moves existing players' furniture across). */
export const HOME_SLOT_SPOTS: Readonly<Record<string, Readonly<Record<string, Readonly<Partial<Record<FurnitureSlot, readonly [number, number, number]>>>>>>> = {
  'home-family': {
    room: { bed: [-1.6, -1.6, 0], storage: [-2.78, -1.15, 90], desk: [2.3, -0.9, -90], tv: [0.55, -2.32, 0], rug: [0.3, 0.4, 0], plants: [2.62, -2.25, 0] },
    kitchen: { dining: [1.2, 0.9, 0] },
  },
  'home-face-me': {
    room: { tv: [1.85, -1.55, -35], dining: [0.9, 1.15, 0], bed: [-0.35, -1.1, 0], rug: [1, -0.95, 90], seating: [0.9, 1.65, 180] },
  },
  'home-self-contain': {
    room: { bed: [-1.95, -1.42, 0], dining: [0.55, 0.55, 0], rug: [0.6, 0.55, 0], tv: [2.28, 1.35, -90], plants: [-0.3, -2, 0] },
  },
  'home-hostel': {
    room: { bed: [-1.9, -1.6, 0], storage: [-2.6, 0.3, 90], desk: [0.6, 0.7, 0], tv: [2.4, 0.3, -90] },
  },
  'home-flat': {
    living: { seating: [-2.97, -0.9, 90], rug: [-1.75, -0.9, 90], tv: [-0.42, -0.9, -90], dining: [1.5, 0.95, 0], plants: [-2.97, 0.45, 0] },
    bedroom: { bed: [-0.6, -1.45, 0], storage: [-2.48, -0.15, 90], desk: [1.6, -2, 0] },
  },
  'home-duplex': {
    living: { seating: [-3.82, 1, 90], rug: [-2.5, 1.4, 90], tv: [-0.82, 1.4, -90], dining: [1.75, 1.3, 0], plants: [2.45, -2.92, 0] },
    bedroom: { bed: [0.8, -1.65, 0], storage: [-1.4, -2.39, 0], desk: [-2.88, 2, 90], plants: [2, 2.3, 0] },
  },
  'home-mansion': {
    living: { seating: [-4.62, 0.95, 90], rug: [-3, 1.9, 90], tv: [-1.47, 1.9, -90], dining: [2, 1.2, 0], plants: [0.3, 3.25, 0] },
    kitchen: { plants: [3.2, 2.3, 0] },
    master: { bed: [-2.96, 0.7, 90], storage: [-3.25, -2.79, 0], desk: [3, -2.69, 0] },
  },
};
