import type { DistrictId } from '@insidelife/shared';

/** Kit ids the city renders as one BatchedMesh each. */
export type KitId = 'commercial' | 'suburban' | 'roads' | 'nature' | 'vehicles';

/** `c:` commercial kit, `s:` suburban kit. */
export type BuildingRef = `c:${string}` | `s:${string}`;

export type InfillStyle = 'dense' | 'towers' | 'garden' | 'rural';

export interface DistrictStyle {
  readonly homes: readonly BuildingRef[];
  readonly buildings: readonly BuildingRef[];
  readonly infill: InfillStyle;
  /** Lot ground colour (sRGB). */
  readonly ground: number;
  /** Yard colour behind compound walls (sRGB). */
  readonly yard: number;
  /** Wall paint colours (multiplied into Kenney's neutral plaster). */
  readonly tints: readonly number[];
  /** Chance a frontage lot is built on (outskirts keep bush plots). */
  readonly buildChance: number;
  readonly streetTrees: 'palm' | 'leafy' | 'mixed' | 'none';
  /** Homes get compound walls with a gate (estates). */
  readonly compoundWalls: boolean;
  /** Extra vertical stretch range for buildings (towers read taller). */
  readonly stretch: readonly [number, number];
}

const MAINLAND_TINTS = [0xf3d48a, 0xf2b07e, 0xe9a64c, 0xa9d39a, 0x9cc7e3, 0xeea6ad, 0xd98559, 0xc3a9e0, 0xf6f2ea, 0xf7e06e, 0x8fd1c2, 0xf4ece0];
const ISLAND_TINTS = [0xf6f3ec, 0xeee3cc, 0xd8d4cd, 0xbdd0e0, 0xead2b0, 0xcfe0cc, 0xf3dfb8, 0xe6c3a8];
const ESTATE_TINTS = [0xf8f5ee, 0xf2e2c4, 0xe9d6bc, 0xd5e4d2, 0xf3d8b4, 0xe3dcec, 0xcfdfe8];

export const DISTRICT_STYLES: Readonly<Record<DistrictId, DistrictStyle>> = {
  ikeja: {
    homes: ['c:building-a', 'c:building-b', 'c:building-d', 'c:building-h', 's:building-type-c', 's:building-type-k', 's:building-type-l'],
    buildings: ['c:building-a', 'c:building-b', 'c:building-d', 'c:building-f', 'c:building-g', 'c:building-h', 'c:building-i'],
    infill: 'dense',
    ground: 0xb9a688,
    yard: 0xa9a17e,
    tints: MAINLAND_TINTS,
    buildChance: 1,
    streetTrees: 'mixed',
    compoundWalls: false,
    stretch: [1, 1.1],
  },
  mushin: {
    homes: ['c:building-a', 'c:building-c', 'c:building-d', 'c:building-h'],
    buildings: ['c:building-c', 'c:building-d', 'c:building-a', 'c:building-h', 'c:building-b'],
    infill: 'dense',
    ground: 0xb38c68,
    yard: 0xa77f5d,
    tints: MAINLAND_TINTS,
    buildChance: 1,
    streetTrees: 'none',
    compoundWalls: false,
    stretch: [0.9, 1.05],
  },
  yaba: {
    homes: ['c:building-a', 'c:building-b', 'c:building-d', 'c:building-f', 'c:building-g'],
    buildings: ['c:building-f', 'c:building-g', 'c:building-i', 'c:building-b', 'c:building-h'],
    infill: 'dense',
    ground: 0xb5a285,
    yard: 0xa79a7c,
    tints: MAINLAND_TINTS,
    buildChance: 1,
    streetTrees: 'leafy',
    compoundWalls: false,
    stretch: [1, 1.1],
  },
  surulere: {
    homes: ['s:building-type-c', 's:building-type-k', 's:building-type-l', 's:building-type-r', 'c:building-a', 'c:building-b'],
    buildings: ['c:building-a', 'c:building-b', 'c:building-c', 'c:building-d', 'c:building-h'],
    infill: 'dense',
    ground: 0xb8a385,
    yard: 0x9fa277,
    tints: MAINLAND_TINTS,
    buildChance: 1,
    streetTrees: 'mixed',
    compoundWalls: true,
    stretch: [1, 1.05],
  },
  ojo: {
    homes: ['s:building-type-g', 's:building-type-h', 's:building-type-i', 's:building-type-m', 's:building-type-c'],
    buildings: ['c:building-c', 'c:building-d', 'c:building-a'],
    infill: 'rural',
    ground: 0xad8458,
    yard: 0x9d8a5c,
    tints: MAINLAND_TINTS,
    buildChance: 0.7,
    streetTrees: 'palm',
    compoundWalls: true,
    stretch: [0.9, 1],
  },
  ikorodu: {
    homes: ['s:building-type-g', 's:building-type-h', 's:building-type-i', 's:building-type-m', 's:building-type-k'],
    buildings: ['c:building-c', 'c:building-d', 'c:building-a', 'c:building-h'],
    infill: 'rural',
    ground: 0xae8759,
    yard: 0x9c8b5d,
    tints: MAINLAND_TINTS,
    buildChance: 0.78,
    streetTrees: 'palm',
    compoundWalls: true,
    stretch: [0.9, 1],
  },
  epe: {
    homes: ['s:building-type-h', 's:building-type-i', 's:building-type-g', 's:building-type-m'],
    buildings: ['c:building-c', 'c:building-d'],
    infill: 'rural',
    ground: 0xa98257,
    yard: 0x8f8e5a,
    tints: MAINLAND_TINTS,
    buildChance: 0.55,
    streetTrees: 'palm',
    compoundWalls: true,
    stretch: [0.9, 1],
  },
  'lagos-island': {
    homes: ['c:building-f', 'c:building-g', 'c:building-b'],
    buildings: ['c:building-f', 'c:building-g', 'c:building-i', 'c:building-skyscraper-a', 'c:building-skyscraper-e'],
    infill: 'towers',
    ground: 0xaaa49a,
    yard: 0x9f9a8e,
    tints: ISLAND_TINTS,
    buildChance: 1,
    streetTrees: 'none',
    compoundWalls: false,
    stretch: [1, 1.25],
  },
  ikoyi: {
    homes: ['s:building-type-d', 's:building-type-f', 's:building-type-n', 's:building-type-t', 's:building-type-u', 's:building-type-s', 's:building-type-o'],
    buildings: ['c:building-f', 'c:building-g', 'c:building-i', 'c:building-skyscraper-a'],
    infill: 'garden',
    ground: 0x9fa77c,
    yard: 0x7f9c58,
    tints: ESTATE_TINTS,
    buildChance: 1,
    streetTrees: 'leafy',
    compoundWalls: true,
    stretch: [1, 1.15],
  },
  'banana-island': {
    homes: ['s:building-type-f', 's:building-type-t', 's:building-type-u', 's:building-type-n', 's:building-type-s', 's:building-type-d'],
    buildings: ['s:building-type-f', 's:building-type-t'],
    infill: 'garden',
    ground: 0xa3ad80,
    yard: 0x78a052,
    tints: ESTATE_TINTS,
    buildChance: 1,
    streetTrees: 'palm',
    compoundWalls: true,
    stretch: [1, 1],
  },
  'victoria-island': {
    homes: ['c:building-f', 'c:building-g', 'c:building-skyscraper-a'],
    buildings: ['c:building-skyscraper-a', 'c:building-skyscraper-b', 'c:building-skyscraper-c', 'c:building-skyscraper-d', 'c:building-skyscraper-e', 'c:building-i', 'c:building-g'],
    infill: 'towers',
    ground: 0xb2ada4,
    yard: 0x99a67c,
    tints: ISLAND_TINTS,
    buildChance: 1,
    streetTrees: 'palm',
    compoundWalls: false,
    stretch: [1.05, 1.35],
  },
  lekki: {
    homes: ['s:building-type-a', 's:building-type-c', 's:building-type-e', 's:building-type-j', 's:building-type-o', 's:building-type-p', 's:building-type-q', 's:building-type-s'],
    buildings: ['c:building-f', 'c:building-i', 'c:building-b', 'c:building-g'],
    infill: 'garden',
    ground: 0xaeac86,
    yard: 0x86a15a,
    tints: ESTATE_TINTS,
    buildChance: 1,
    streetTrees: 'palm',
    compoundWalls: true,
    stretch: [1, 1.1],
  },
  ajah: {
    homes: ['s:building-type-a', 's:building-type-c', 's:building-type-g', 's:building-type-h', 's:building-type-i', 's:building-type-k'],
    buildings: ['c:building-a', 'c:building-c', 'c:building-d', 'c:building-h'],
    infill: 'rural',
    ground: 0xb39b74,
    yard: 0x949a62,
    tints: MAINLAND_TINTS,
    buildChance: 0.9,
    streetTrees: 'palm',
    compoundWalls: true,
    stretch: [0.95, 1.05],
  },
};
