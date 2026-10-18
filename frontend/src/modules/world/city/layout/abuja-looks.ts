import type { MarketStyle, ParkStyle, ShopFlavour } from './placements';
import type { BuildingRef } from './styles';

/**
 * How Abuja's venues look from the road. Venues of one type share an archetype, so without these tables every Abuja
 * pharmacy, bank or market would be the same building in a different colour; each place here has its own paint, its own
 * building and the thing out front that says what it is. Pure data (the plan in `placements.ts` reads it by venue id).
 */

/** Markets: Banex is a glass plaza of phone shops; Garki is the old rows of stalls; Kubwa and Lugbe are plain and dusty. */
export const ABUJA_MARKET_STYLES: Readonly<Record<string, MarketStyle>> = {
  'wuse-market': { ground: 0xa6916b, stalls: [0xe07a2f, 0x3c9a5f, 0xd94b3b, 0xf2b81d], parasols: 0.6, kiosks: 0.05, back: 'c:building-c', backTint: 0xf3d48a },
  'banex-plaza': { ground: 0x7d8186, stalls: [0x1d4e89, 0xffffff, 0x00acc1, 0xcfd8dc], parasols: 0.05, kiosks: 0.5, back: 'c:building-j', backTint: 0xbfd9ea },
  'garki-market': { ground: 0x9c8461, stalls: [0xc8287a, 0xf2b81d, 0x2e7d32, 0x7b1fa2, 0xd94b3b], parasols: 0.45, kiosks: 0.05, back: 'c:building-a', backTint: 0xeea6ad },
  'kubwa-market': { ground: 0x93754f, stalls: [0xe07a2f, 0x8d6e63, 0x558b2f], parasols: 0.3, kiosks: 0, back: 'c:building-d', backTint: 0xd98559 },
  'lugbe-market': { ground: 0xa28762, stalls: [0x3c9a5f, 0xf2b81d, 0xd94b3b], parasols: 0.55, kiosks: 0, back: 'c:building-c', backTint: 0xa9d39a },
};

/** Parks: Eagle Square is a paved parade ground ringed with flagpoles; Millennium Park is a forest of lawns. */
export const ABUJA_PARK_STYLES: Readonly<Record<string, ParkStyle>> = {
  'eagle-square': { ground: 0xd6d0c0, density: 0.03, wall: false, poles: 5 },
  'millennium-park': { ground: 0x5f9a45, density: 1.7, wall: false, poles: 0 },
  'jabi-lake-park': { ground: 0x7aa857, density: 0.8, wall: false, poles: 1 },
  'abuja-club': { ground: 0x6aa83f, density: 0.45, wall: false, poles: 2 },
};

/** Neighbourhood shops, clubs and offices: paint, accessory and (for some) their own building. */
export interface AbujaShopLook extends ShopFlavour {
  readonly refs?: readonly BuildingRef[];
}
export const ABUJA_SHOP_LOOKS: Readonly<Record<string, AbujaShopLook>> = {
  'silverbird-cinemas-abuja': { tint: 0xc9b8e8, accessory: 'kiosk', accent: 0xc62828, refs: ['c:building-h'] },
  'jevinik-restaurant': { tint: 0xf6efe2, accessory: 'hut', accent: 0xb8860b, refs: ['c:building-b'] },
  'medplus-maitama': { tint: 0xe2f3e6, accessory: 'kiosk', accent: 0x1e8e4e, refs: ['c:building-a'] },
  'healthplus-wuse': { tint: 0xdff0f0, accessory: 'kiosk', accent: 0x00897b, refs: ['c:building-b'] },
  'wuse-fitness': { tint: 0x8fb0c8, accessory: 'flagpole', accent: 0xd96b1e, refs: ['c:building-d'] },
  'yahuza-suya': { tint: 0xf2a65a, accessory: 'stall', accent: 0xd84315, refs: ['c:building-c'] },
  'wuse-salon': { tint: 0xf0b3c8, accessory: 'kiosk', accent: 0xad1457, refs: ['c:building-a'] },
  'rhapsodys-abuja': { tint: 0xefe0c8, accessory: 'hut', accent: 0x6d4c41, refs: ['c:building-h'] },
  'cue-bar': { tint: 0x3d5a80, refs: ['c:building-d'] },
  'play-imperial': { tint: 0x4a2c6e, refs: ['c:building-h', 'c:building-g'] },
  'jamb-cbt-garki': { tint: 0xdce6f2, accessory: 'flagpole', accent: 0x1d4e89, refs: ['c:building-b'] },
  'garki-pharmacy': { tint: 0xd9efd2, accessory: 'kiosk', accent: 0x2e7d32, refs: ['c:building-c'] },
  'garki-gym': { tint: 0xb0a98f, accessory: 'flagpole', accent: 0x6d4c41, refs: ['c:building-a'] },
  'garki-salon': { tint: 0xe8a2d8, accessory: 'kiosk', accent: 0x8e24aa, refs: ['c:building-d'] },
  'brains-and-hammers': { tint: 0xf3dfb8, accessory: 'flagpole', accent: 0x13606b, refs: ['c:building-g'] },
  'jabi-lake-lounge': { tint: 0x2e5d6b, refs: ['c:building-g'] },
  'gwarinpa-buka': { tint: 0xf2c078, accessory: 'stall', accent: 0xe65100, refs: ['c:building-c'] },
  'kubwa-pharmacy': { tint: 0xe0f2d6, accessory: 'kiosk', accent: 0x558b2f, refs: ['c:building-a'] },
  // Banks are glass-and-paint branches in their brand colours.
  'gtbank-wuse': { tint: 0xf4a53a, accessory: 'flagpole', accent: 0xe65100, refs: ['c:building-i'] },
  'access-bank-utako': { tint: 0xf0d9b5, accessory: 'flagpole', accent: 0x1565c0, refs: ['c:building-i'] },
  'first-bank-garki': { tint: 0x9db4d8, accessory: 'flagpole', accent: 0x1c3f7a, refs: ['c:building-i'] },
};

/** Towers: their height, count and paint (Abuja's skyline is pale and tidy, not Lagos's glass). */
export interface AbujaTowerLook {
  readonly towers: readonly BuildingRef[];
  readonly count: number;
  readonly stretch: number;
  readonly tint: number;
}
export const ABUJA_TOWER_LOOKS: Readonly<Record<string, AbujaTowerLook>> = {
  'nnpc-towers': { towers: ['c:building-skyscraper-b'], count: 2, stretch: 1.7, tint: 0xe3eee6 },
  'cbn-hq': { towers: ['c:building-skyscraper-d'], count: 1, stretch: 1.55, tint: 0xf4f1ea },
  'central-area-towers': { towers: ['c:building-skyscraper-c', 'c:building-skyscraper-e'], count: 2, stretch: 1.3, tint: 0xdde3e8 },
  'transcorp-hilton': { towers: ['c:building-skyscraper-a'], count: 1, stretch: 1.5, tint: 0xf2e8d5 },
  'sheraton-abuja': { towers: ['c:building-skyscraper-e'], count: 1, stretch: 1.35, tint: 0xe6d3bd },
  // One-cell hotels: a bank-sized block, stretched up (the tall skyscraper models need a wider plot).
  'fraser-suites-abuja': { towers: ['c:building-i'], count: 1, stretch: 1.7, tint: 0xe9e4d8 },
  'chelsea-hotel-abuja': { towers: ['c:building-i'], count: 1, stretch: 1.4, tint: 0xeadfd0 },
};

/** Government compounds: building, paint, and whether a compound wall with a gate closes the lot (embassies). */
export interface AbujaGovernmentLook {
  readonly ref: BuildingRef;
  readonly tint: number;
  readonly stretch: number;
  readonly walled: boolean;
}
export const ABUJA_GOVERNMENT_LOOKS: Readonly<Record<string, AbujaGovernmentLook>> = {
  'federal-secretariat': { ref: 'c:building-skyscraper-c', tint: 0xcfc9bb, stretch: 1.25, walled: false },
  'us-embassy-abuja': { ref: 'c:building-e', tint: 0xeae6dc, stretch: 1.1, walled: true },
  'uk-high-commission': { ref: 'c:building-b', tint: 0xf0e8d6, stretch: 1, walled: true },
  'canada-high-commission': { ref: 'c:building-e', tint: 0xf3ece3, stretch: 1, walled: true },
  'force-headquarters': { ref: 'c:building-k', tint: 0xdcd8c8, stretch: 1.5, walled: true },
  'wuse-police-division': { ref: 'c:building-e', tint: 0xcfd6dc, stretch: 1, walled: false },
  'garki-police-command': { ref: 'c:building-e', tint: 0xcfd6dc, stretch: 1, walled: false },
};

/** Places drawn entirely by `render/abuja-geometry.ts` (no kit building): the plan keeps them solid. */
export const ABUJA_PROCEDURAL: ReadonlyMap<string, { readonly height: number }> = new Map([
  ['national-mosque', { height: 12 }],
  ['national-christian-centre', { height: 16 }],
  ['national-assembly', { height: 14 }],
  ['dunamis-glory-dome', { height: 18 }],
  ['rccg-gwarinpa', { height: 9 }],
  ['garki-central-mosque', { height: 7 }],
  ['gwarinpa-central-mosque', { height: 7 }],
]);
