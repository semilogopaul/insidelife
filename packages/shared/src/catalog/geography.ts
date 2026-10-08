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
] as const;
export type DistrictId = (typeof DISTRICT_IDS)[number];

export type DistrictSide = 'mainland' | 'island' | 'outskirts';

export interface DistrictDefinition {
  readonly id: DistrictId;
  readonly name: string;
  readonly side: DistrictSide;
  readonly tagline: string;
  /** Map-plane centre (x east, z south). */
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

/** Places outside Lagos you can be (out-of-town campuses, other cities). */
export const REGION_IDS = [
  'lagos',
  'ogun',
  'ibadan',
  'ife',
  'ekiti',
  'iwo',
  'nsukka',
  'zaria',
  'yola',
  'abuja',
] as const;
export type RegionId = (typeof REGION_IDS)[number];

export interface RegionDefinition {
  readonly id: RegionId;
  readonly name: string;
  /** Road travel time from Lagos in game hours (bus). */
  readonly busHoursFromLagos: number;
  /** Bus fare from Lagos (₦). */
  readonly busFare: number;
  /** Flight fare from Lagos (₦) or null if no practical flight. */
  readonly flightFare: number | null;
}

export const REGIONS: Readonly<Record<RegionId, RegionDefinition>> = {
  lagos: { id: 'lagos', name: 'Lagos', busHoursFromLagos: 0, busFare: 0, flightFare: null },
  ogun: { id: 'ogun', name: 'Ogun State', busHoursFromLagos: 2, busFare: 6_000, flightFare: null },
  ibadan: { id: 'ibadan', name: 'Ibadan', busHoursFromLagos: 3, busFare: 9_000, flightFare: null },
  ife: { id: 'ife', name: 'Ile-Ife', busHoursFromLagos: 4, busFare: 12_000, flightFare: null },
  ekiti: { id: 'ekiti', name: 'Ado-Ekiti', busHoursFromLagos: 6, busFare: 16_000, flightFare: null },
  iwo: { id: 'iwo', name: 'Iwo', busHoursFromLagos: 4, busFare: 12_000, flightFare: null },
  nsukka: { id: 'nsukka', name: 'Nsukka', busHoursFromLagos: 10, busFare: 28_000, flightFare: 140_000 },
  zaria: { id: 'zaria', name: 'Zaria', busHoursFromLagos: 12, busFare: 32_000, flightFare: 150_000 },
  yola: { id: 'yola', name: 'Yola', busHoursFromLagos: 18, busFare: 45_000, flightFare: 190_000 },
  abuja: { id: 'abuja', name: 'Abuja', busHoursFromLagos: 10, busFare: 25_000, flightFare: 120_000 },
};
