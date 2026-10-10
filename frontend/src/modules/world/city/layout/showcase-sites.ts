import { CITY_MAP, venueLot, type CityBounds, type CityLot } from '@insidelife/shared';

/**
 * Where the showcase places stand, derived from their lots (never from fixed coordinates, so the sites follow the
 * map): OBO's estate spans the mansion lot, the jet pad lot and the apron landmark; Dangote Refinery is the visitor
 * centre's lot plus the works landmark on the lagoon shore. Pure; shared by the city plan (ground, walls, palms,
 * colliders) and the procedural geometry.
 */

export interface Rect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface EstateSite {
  /** The mansion's lot (gate on its north edge), the jet pad lot west of the apron, the apron on the waterfront. */
  readonly grounds: Rect;
  readonly pad: Rect;
  readonly apron: Rect | null;
  /** Gate centres on the lot edges (from the venue doors). */
  readonly gate: { readonly x: number; readonly z: number };
  readonly jetGate: { readonly x: number; readonly z: number };
  /** House volumes: ground floor, the cantilevered first floor, the penthouse, and the roof slab over it. */
  readonly house: { readonly ground: Rect; readonly first: Rect; readonly top: Rect; readonly roof: Rect };
  readonly pool: Rect;
  readonly deck: Rect;
  readonly driveway: Rect;
  readonly forecourt: Rect;
  /** The jet: nose x, tail x, centreline z (nose pointing west, at the apron gate). */
  readonly jet: { readonly nose: number; readonly tail: number; readonly z: number };
}

export interface RefinerySite {
  /** The visitor centre's lot (its door faces the junction) and the works on the shore behind it. */
  readonly centre: Rect;
  readonly works: Rect;
  readonly door: { readonly x: number; readonly z: number };
  readonly tanks: readonly { readonly x: number; readonly z: number; readonly r: number; readonly h: number }[];
}

const rect = (bounds: CityBounds): Rect => ({ minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ });
const landmark = (id: string): CityLot | undefined => CITY_MAP.lots.find((lot) => lot.id === `landmark:${id}`);

/** OBO's estate, or null if its lots are missing. */
export function estateSite(): EstateSite | null {
  const mansion = venueLot('obo-mansion');
  const jet = venueLot('air-obo');
  if (!mansion?.entrance || !jet?.entrance) return null;
  const g = rect(mansion.footprint);
  const p = rect(jet.footprint);
  const apron = landmark('obo-apron');
  return {
    grounds: g,
    pad: p,
    apron: apron ? rect(apron.footprint) : null,
    gate: { x: mansion.entrance.position.x, z: g.minZ },
    jetGate: { x: p.minX, z: jet.entrance.position.z },
    house: {
      ground: { minX: g.minX + 12, maxX: g.maxX - 3, minZ: g.minZ + 10.5, maxZ: g.maxZ - 4 },
      first: { minX: g.minX + 8.5, maxX: g.maxX - 4.5, minZ: g.minZ + 8.5, maxZ: g.maxZ - 6 },
      top: { minX: g.minX + 16, maxX: g.maxX - 5, minZ: g.minZ + 11, maxZ: g.maxZ - 7 },
      roof: { minX: g.minX + 13.5, maxX: g.maxX - 3, minZ: g.minZ + 9.5, maxZ: g.maxZ - 5 },
    },
    pool: { minX: g.minX + 2.2, maxX: g.minX + 9, minZ: g.minZ + 14, maxZ: g.maxZ - 3 },
    deck: { minX: g.minX + 1, maxX: g.minX + 11, minZ: g.minZ + 12.5, maxZ: g.maxZ - 1.5 },
    driveway: { minX: mansion.entrance.position.x - 3, maxX: mansion.entrance.position.x + 3, minZ: g.minZ, maxZ: g.minZ + 8.5 },
    forecourt: { minX: g.minX + 2, maxX: g.minX + 32, minZ: g.minZ + 3, maxZ: g.minZ + 8.5 },
    jet: { nose: p.minX + 3.5, tail: p.minX + 22.5, z: p.minZ + 2.5 },
  };
}

/** Dangote Refinery, or null if its lots are missing. */
export function refinerySite(): RefinerySite | null {
  const centre = venueLot('dangote-refinery');
  const works = landmark('dangote-works');
  if (!centre?.entrance || !works) return null;
  const w = rect(works.footprint);
  // The tank farm: two rows of three on the shore end of the works, the process units north of them.
  const tanks = [8, 22, 36].flatMap((dx, i) => [12, 28].map((dz, j) => ({ x: w.minX + dx, z: w.maxZ - dz, r: 6 - j * 0.4, h: 11 - ((i + j) % 2) * 1.6 })));
  return { centre: rect(centre.footprint), works: w, door: centre.entrance.position, tanks };
}
