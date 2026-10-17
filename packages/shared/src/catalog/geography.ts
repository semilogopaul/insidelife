/**
 * Lagos, stylised.
 *
 * District coordinates are in map units (~1 unit ≈ 1 km) on a plane where +x is east and +z is south, loosely
 * following real geography: the Mainland to the north-west, the Lagos Lagoon in the middle, the Island and the
 * Lekki peninsula to the south-east, the Atlantic along the south. The server uses these coordinates for travel
 * times; the client uses them to lay out the 3D city.
 */

export const DISTRICT_IDS = [
  'ikeja',
  'ikorodu',
  'mushin',
  'surulere',
  'yaba',
  'ojo',
  'lagos-island',
  'ikoyi',
  'banana-island',
  'victoria-island',
  'lekki',
  'ajah',
  'epe',
  // Abuja (docs/MULTI_CITY.md)
  'abuja-cbd',
  'maitama',
  'asokoro',
  'wuse',
  'garki',
  'jabi',
  'gwarinpa',
  'kubwa',
  'lugbe',
] as const;
export type DistrictId = (typeof DISTRICT_IDS)[number];

export type DistrictSide = 'mainland' | 'island' | 'outskirts';

export const CITY_IDS = ['lagos', 'abuja'] as const;
export type CityId = (typeof CITY_IDS)[number];

export interface DistrictDefinition {
  readonly id: DistrictId;
  /** The city the district belongs to. A character is always in exactly one city. */
  readonly cityId: CityId;
  readonly name: string;
  readonly side: DistrictSide;
  readonly tagline: string;
  /** Map-plane centre in the city's own km frame (x east, z south). Travel times use distances within a city only. */
  readonly x: number;
  readonly z: number;
  /** Multiplier on base annual rents (Surulere = 1). */
  readonly rentMultiplier: number;
  /** Price of a ~600 sqm plot with C of O (₦), or null if land isn't sold here. */
  readonly landPricePerPlot: number | null;
  /** Expected yearly land appreciation (fraction). */
  readonly landAppreciation: number;
  /** 0-1: chance that a heavy-rain day floods the district. */
  readonly floodRisk: number;
  /** 0-1: petty crime exposure. */
  readonly crimeRisk: number;
  /** 0-100: how much living here impresses people. */
  readonly prestige: number;
  /** Hours of grid power per day on a typical feeder (Band A ≈ 20). */
  readonly gridHours: number;
}

export const DISTRICTS: Readonly<Record<DistrictId, DistrictDefinition>> = {
  ikeja: {
    id: 'ikeja',
    cityId: 'lagos',
    name: 'Ikeja',
    side: 'mainland',
    tagline: 'State capital, Computer Village and the airport',
    x: -6,
    z: -11,
    rentMultiplier: 1.5,
    landPricePerPlot: 120_000_000,
    landAppreciation: 0.06,
    floodRisk: 0.08,
    crimeRisk: 0.35,
    prestige: 55,
    gridHours: 16,
  },
  ikorodu: {
    id: 'ikorodu',
    cityId: 'lagos',
    name: 'Ikorodu',
    side: 'outskirts',
    tagline: 'Cheap rent, long BRT rides',
    x: 9,
    z: -16,
    rentMultiplier: 0.55,
    landPricePerPlot: 8_000_000,
    landAppreciation: 0.07,
    floodRisk: 0.12,
    crimeRisk: 0.4,
    prestige: 15,
    gridHours: 10,
  },
  mushin: {
    id: 'mushin',
    cityId: 'lagos',
    name: 'Mushin',
    side: 'mainland',
    tagline: 'Face-me-I-face-you, LUTH and pure hustle',
    x: -6,
    z: -4,
    rentMultiplier: 0.6,
    landPricePerPlot: null,
    landAppreciation: 0.04,
    floodRisk: 0.15,
    crimeRisk: 0.6,
    prestige: 8,
    gridHours: 9,
  },
  surulere: {
    id: 'surulere',
    cityId: 'lagos',
    name: 'Surulere',
    side: 'mainland',
    tagline: 'Middle-class Lagos, National Stadium, amala joints',
    x: -7,
    z: 1,
    rentMultiplier: 1,
    landPricePerPlot: null,
    landAppreciation: 0.05,
    floodRisk: 0.1,
    crimeRisk: 0.35,
    prestige: 35,
    gridHours: 13,
  },
  yaba: {
    id: 'yaba',
    cityId: 'lagos',
    name: 'Yaba',
    side: 'mainland',
    tagline: 'UNILAG, Yabatech and the startup hubs',
    x: -2,
    z: -2,
    rentMultiplier: 1.3,
    landPricePerPlot: null,
    landAppreciation: 0.06,
    floodRisk: 0.12,
    crimeRisk: 0.3,
    prestige: 40,
    gridHours: 14,
  },
  ojo: {
    id: 'ojo',
    cityId: 'lagos',
    name: 'Ojo',
    side: 'outskirts',
    tagline: 'LASU and the Badagry road',
    x: -16,
    z: 2,
    rentMultiplier: 0.6,
    landPricePerPlot: 10_000_000,
    landAppreciation: 0.06,
    floodRisk: 0.15,
    crimeRisk: 0.45,
    prestige: 12,
    gridHours: 10,
  },
  'lagos-island': {
    id: 'lagos-island',
    cityId: 'lagos',
    name: 'Lagos Island',
    side: 'island',
    tagline: 'Balogun Market, Marina banks and the old city',
    x: 1,
    z: 5,
    rentMultiplier: 1.2,
    landPricePerPlot: null,
    landAppreciation: 0.05,
    floodRisk: 0.2,
    crimeRisk: 0.45,
    prestige: 30,
    gridHours: 15,
  },
  ikoyi: {
    id: 'ikoyi',
    cityId: 'lagos',
    name: 'Ikoyi',
    side: 'island',
    tagline: 'Old money, embassies, quiet leafy streets',
    x: 5,
    z: 4,
    rentMultiplier: 5.5,
    landPricePerPlot: 1_200_000_000,
    landAppreciation: 0.07,
    floodRisk: 0.1,
    crimeRisk: 0.1,
    prestige: 90,
    gridHours: 20,
  },
  'banana-island': {
    id: 'banana-island',
    cityId: 'lagos',
    name: 'Banana Island',
    side: 'island',
    tagline: 'Where billionaires sleep',
    x: 8,
    z: 2,
    rentMultiplier: 9,
    landPricePerPlot: 1_850_000_000,
    landAppreciation: 0.08,
    floodRisk: 0.08,
    crimeRisk: 0.05,
    prestige: 100,
    gridHours: 22,
  },
  'victoria-island': {
    id: 'victoria-island',
    cityId: 'lagos',
    name: 'Victoria Island',
    side: 'island',
    tagline: 'Corporate HQs, Eko Hotel and the clubs',
    x: 4,
    z: 9,
    rentMultiplier: 5,
    landPricePerPlot: null,
    landAppreciation: 0.06,
    floodRisk: 0.3,
    crimeRisk: 0.2,
    prestige: 80,
    gridHours: 19,
  },
  lekki: {
    id: 'lekki',
    cityId: 'lagos',
    name: 'Lekki',
    side: 'island',
    tagline: 'Phase 1 estates, beaches and the toll gate',
    x: 12,
    z: 8,
    rentMultiplier: 3.5,
    landPricePerPlot: 570_000_000,
    landAppreciation: 0.08,
    floodRisk: 0.3,
    crimeRisk: 0.15,
    prestige: 70,
    gridHours: 17,
  },
  ajah: {
    id: 'ajah',
    cityId: 'lagos',
    name: 'Ajah',
    side: 'island',
    tagline: 'Estates, go-slow and growing fast',
    x: 20,
    z: 8,
    rentMultiplier: 1.6,
    landPricePerPlot: 25_000_000,
    landAppreciation: 0.09,
    floodRisk: 0.25,
    crimeRisk: 0.3,
    prestige: 40,
    gridHours: 12,
  },
  epe: {
    id: 'epe',
    cityId: 'lagos',
    name: 'Epe & Ibeju-Lekki',
    side: 'outskirts',
    tagline: 'Free Trade Zone land rush — buy now, thank yourself later',
    x: 30,
    z: 6,
    rentMultiplier: 0.5,
    landPricePerPlot: 20_000_000,
    landAppreciation: 0.11,
    floodRisk: 0.15,
    crimeRisk: 0.25,
    prestige: 10,
    gridHours: 8,
  },
  'abuja-cbd': {
    id: 'abuja-cbd',
    cityId: 'abuja',
    name: 'Central Business District',
    side: 'mainland',
    tagline: 'Ministries, glass towers and Eagle Square',
    x: 0,
    z: 0,
    rentMultiplier: 3.2,
    landPricePerPlot: null,
    landAppreciation: 0.06,
    floodRisk: 0.05,
    crimeRisk: 0.2,
    prestige: 60,
    gridHours: 20,
  },
  maitama: {
    id: 'maitama',
    cityId: 'abuja',
    name: 'Maitama',
    side: 'mainland',
    tagline: 'Embassies, mansions and the quiet money',
    x: 4,
    z: -5,
    rentMultiplier: 5.2,
    landPricePerPlot: 1_400_000_000,
    landAppreciation: 0.07,
    floodRisk: 0.04,
    crimeRisk: 0.08,
    prestige: 92,
    gridHours: 22,
  },
  asokoro: {
    id: 'asokoro',
    cityId: 'abuja',
    name: 'Asokoro',
    side: 'mainland',
    tagline: 'Under Aso Rock: presidential neighbours, tight security',
    x: 5,
    z: 3,
    rentMultiplier: 5.6,
    landPricePerPlot: 1_500_000_000,
    landAppreciation: 0.07,
    floodRisk: 0.04,
    crimeRisk: 0.06,
    prestige: 96,
    gridHours: 22,
  },
  wuse: {
    id: 'wuse',
    cityId: 'abuja',
    name: 'Wuse (Wuse 2)',
    side: 'mainland',
    tagline: 'Shops, nightlife, Wuse Market and Banex',
    x: -1,
    z: -4,
    rentMultiplier: 3.1,
    landPricePerPlot: null,
    landAppreciation: 0.06,
    floodRisk: 0.08,
    crimeRisk: 0.25,
    prestige: 64,
    gridHours: 19,
  },
  garki: {
    id: 'garki',
    cityId: 'abuja',
    name: 'Garki',
    side: 'mainland',
    tagline: 'Older centre, big markets and busy hospitals',
    x: -1,
    z: 5,
    rentMultiplier: 2.1,
    landPricePerPlot: null,
    landAppreciation: 0.05,
    floodRisk: 0.1,
    crimeRisk: 0.35,
    prestige: 42,
    gridHours: 16,
  },
  jabi: {
    id: 'jabi',
    cityId: 'abuja',
    name: 'Jabi / Utako',
    side: 'mainland',
    tagline: 'Jabi Lake, the mall and the offices',
    x: -8,
    z: -6,
    rentMultiplier: 2.8,
    landPricePerPlot: 450_000_000,
    landAppreciation: 0.07,
    floodRisk: 0.12,
    crimeRisk: 0.22,
    prestige: 60,
    gridHours: 18,
  },
  gwarinpa: {
    id: 'gwarinpa',
    cityId: 'abuja',
    name: 'Gwarinpa',
    side: 'outskirts',
    tagline: 'Africa’s biggest housing estate, middle-class Abuja',
    x: -14,
    z: -12,
    rentMultiplier: 1.6,
    landPricePerPlot: 90_000_000,
    landAppreciation: 0.08,
    floodRisk: 0.15,
    crimeRisk: 0.3,
    prestige: 44,
    gridHours: 15,
  },
  kubwa: {
    id: 'kubwa',
    cityId: 'abuja',
    name: 'Kubwa',
    side: 'outskirts',
    tagline: 'Busy satellite town: cheaper rent, long expressway queues',
    x: -22,
    z: -18,
    rentMultiplier: 0.8,
    landPricePerPlot: 25_000_000,
    landAppreciation: 0.09,
    floodRisk: 0.18,
    crimeRisk: 0.5,
    prestige: 16,
    gridHours: 11,
  },
  lugbe: {
    id: 'lugbe',
    cityId: 'abuja',
    name: 'Lugbe / Airport Road',
    side: 'outskirts',
    tagline: 'Cheaper rent, the airport and the estates beside it',
    x: -12,
    z: 14,
    rentMultiplier: 0.65,
    landPricePerPlot: 18_000_000,
    landAppreciation: 0.1,
    floodRisk: 0.2,
    crimeRisk: 0.45,
    prestige: 15,
    gridHours: 10,
  },
};

export function getDistrict(id: DistrictId): DistrictDefinition {
  return DISTRICTS[id];
}

/** Straight-line distance between district centres in map units (~km). */
export function districtDistance(a: DistrictId, b: DistrictId): number {
  const da = DISTRICTS[a];
  const db = DISTRICTS[b];
  return Math.hypot(da.x - db.x, da.z - db.z);
}

/** Crossing between the Mainland/outskirts and the Island means a bridge (Third Mainland, Carter, Eko). */
export function crossesLagoon(a: DistrictId, b: DistrictId): boolean {
  const sa = DISTRICTS[a].side === 'island';
  const sb = DISTRICTS[b].side === 'island';
  return sa !== sb;
}

/** Cities. Regions (the old out-of-town campuses) are gone: the game is Lagos + Abuja (docs/MULTI_CITY.md). */
export interface CityDefinition {
  readonly id: CityId;
  readonly name: string;
  readonly tagline: string;
  /** Districts of the city, in `DISTRICT_IDS` order. */
  readonly districtIds: readonly DistrictId[];
  /** Commercial airport venue (airlines, counters). */
  readonly airportVenueId: string;
  /** General Aviation Terminal venue (private flights, hangars). */
  readonly gatVenueId: string;
  /** Where interstate buses stop. */
  readonly busStationVenueId: string;
  /** Default district for a new arrival with no home here (the city centre). */
  readonly centreDistrictId: DistrictId;
}

const districtsOf = (city: CityId): readonly DistrictId[] => DISTRICT_IDS.filter((id) => DISTRICTS[id].cityId === city);

export const CITIES: Readonly<Record<CityId, CityDefinition>> = {
  lagos: {
    id: 'lagos',
    name: 'Lagos',
    tagline: 'Africa’s hustle capital',
    districtIds: districtsOf('lagos'),
    airportVenueId: 'mmia-airport',
    gatVenueId: 'mmia-gat',
    busStationVenueId: 'cms-motor-park',
    centreDistrictId: 'lagos-island',
  },
  abuja: {
    id: 'abuja',
    name: 'Abuja',
    tagline: 'The federal capital: wide roads, big offices, quiet money',
    districtIds: districtsOf('abuja'),
    airportVenueId: 'naia-airport',
    gatVenueId: 'naia-gat',
    busStationVenueId: 'utako-motor-park',
    centreDistrictId: 'abuja-cbd',
  },
};

export const DEFAULT_CITY_ID: CityId = 'lagos';

/** What rides, maps and GPS say about a place in the other city (there is no road between the cities). */
export const OTHER_CITY_REASON = 'That’s in another city. Fly or take the bus.';

export function isCityId(value: unknown): value is CityId {
  return typeof value === 'string' && (CITY_IDS as readonly string[]).includes(value);
}

export function getCity(id: CityId): CityDefinition {
  return CITIES[id];
}

/** The city a district is in. */
export function cityOfDistrict(districtId: DistrictId): CityId {
  return DISTRICTS[districtId].cityId;
}

/** True when two districts are in the same city (so roads, rides and the map connect them). */
export function sameCity(a: DistrictId, b: DistrictId): boolean {
  return DISTRICTS[a].cityId === DISTRICTS[b].cityId;
}

/**
 * The Lagos ↔ Abuja interstate bus: the slow, cheap way between the cities (~10 game hours). A real bus fare in naira
 * (prices are prices: no INCOME_MULTIPLIER); the booking scales with the world's fare index like other fares.
 */
export const INTERSTATE_BUS = {
  /** Door to door, in game hours. */
  hours: 10,
  /** Fare (₦) at price index 1. */
  fare: 25_000,
} as const;
