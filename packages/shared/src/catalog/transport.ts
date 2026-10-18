import { pacedTripMinutes } from '../rules/pacing.js';
import { cityOfDistrict, crossesLagoon, DISTRICTS, districtDistance, type CityId, type DistrictId } from './geography.js';

export const TRANSPORT_MODES = ['walk', 'okada', 'keke', 'danfo', 'brt', 'bolt', 'car', 'taxi', 'bus'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

/** Between cities: a commercial or private flight, or the interstate coach. Never a ride on the city's roads. */
export const INTERCITY_MODES = ['flight', 'coach'] as const;
export type IntercityMode = (typeof INTERCITY_MODES)[number];
/** Any way a trip can be made: within a city (`TransportMode`) or between cities. */
export type TravelMode = TransportMode | IntercityMode;

export function isIntercityMode(mode: string): mode is IntercityMode {
  return (INTERCITY_MODES as readonly string[]).includes(mode);
}

export interface TransportDefinition {
  readonly id: TransportMode;
  readonly label: string;
  readonly blurb: string;
  /** Average speed in map units (~km) per game hour with free-flowing traffic. */
  readonly speed: number;
  /** Fixed fare per trip (₦). */
  readonly baseFare: number;
  /** Fare per map unit (₦). */
  readonly farePerKm: number;
  /** How badly go-slow affects this mode (okada weaves through, danfo suffers). 0 = immune, 1 = full effect. */
  readonly trafficExposure: number;
  /** Need drift while riding: energy and fun change per hour (negative is draining). */
  readonly energyPerHour: number;
  readonly funPerHour: number;
  /** Chance per trip of an incident (accident, robbery, task force). */
  readonly incidentRisk: number;
  /** Max trip distance in map units (walking far is not a plan). */
  readonly maxDistance: number;
  readonly requiresVehicle: boolean;
  /** Okada can't cross onto the Island highways (Lagos ban). */
  readonly bannedAcrossLagoon: boolean;
  /** The cities where this mode runs at all (danfo and BRT are Lagos; the green cab and city bus are Abuja). */
  readonly cities: readonly CityId[];
}

const BOTH: readonly CityId[] = ['lagos', 'abuja'];
const LAGOS_ONLY: readonly CityId[] = ['lagos'];
const ABUJA_ONLY: readonly CityId[] = ['abuja'];

export const TRANSPORT: Readonly<Record<TransportMode, TransportDefinition>> = {
  walk: {
    id: 'walk',
    label: 'Trek',
    blurb: 'Free. Your legs will testify.',
    speed: 4.5,
    baseFare: 0,
    farePerKm: 0,
    trafficExposure: 0,
    energyPerHour: -9,
    funPerHour: -2,
    incidentRisk: 0.01,
    maxDistance: 6,
    requiresVehicle: false,
    bannedAcrossLagoon: false,
    cities: BOTH,
  },
  okada: {
    id: 'okada',
    label: 'Okada',
    blurb: 'Fastest through go-slow. Hold on tight.',
    speed: 28,
    baseFare: 500,
    farePerKm: 180,
    trafficExposure: 0.35,
    energyPerHour: -4,
    funPerHour: 1,
    incidentRisk: 0.03,
    maxDistance: 14,
    requiresVehicle: false,
    bannedAcrossLagoon: true,
    cities: BOTH,
  },
  keke: {
    id: 'keke',
    label: 'Keke',
    blurb: 'Three wheels, three passengers, one loud speaker.',
    speed: 18,
    baseFare: 300,
    farePerKm: 90,
    trafficExposure: 0.7,
    energyPerHour: -3,
    funPerHour: 0,
    incidentRisk: 0.012,
    maxDistance: 12,
    requiresVehicle: false,
    bannedAcrossLagoon: true,
    cities: BOTH,
  },
  danfo: {
    id: 'danfo',
    label: 'Danfo',
    blurb: '"Enter with your change!" Cheap and chaotic.',
    speed: 17,
    baseFare: 300,
    farePerKm: 45,
    trafficExposure: 1,
    energyPerHour: -5,
    funPerHour: -3,
    incidentRisk: 0.015,
    maxDistance: 60,
    requiresVehicle: false,
    bannedAcrossLagoon: false,
    cities: LAGOS_ONLY,
  },
  brt: {
    id: 'brt',
    label: 'BRT',
    blurb: 'Dedicated lane, long queues, fair price.',
    speed: 22,
    baseFare: 450,
    farePerKm: 30,
    trafficExposure: 0.55,
    energyPerHour: -3,
    funPerHour: -1,
    incidentRisk: 0.004,
    maxDistance: 60,
    requiresVehicle: false,
    bannedAcrossLagoon: false,
    cities: LAGOS_ONLY,
  },
  bolt: {
    id: 'bolt',
    label: 'Bolt',
    blurb: 'AC, aux cord, surge pricing when it rains.',
    speed: 24,
    baseFare: 1_200,
    farePerKm: 650,
    trafficExposure: 0.9,
    energyPerHour: -1,
    funPerHour: 1,
    incidentRisk: 0.004,
    maxDistance: 80,
    requiresVehicle: false,
    bannedAcrossLagoon: false,
    cities: BOTH,
  },
  car: {
    id: 'car',
    label: 'Own car',
    blurb: 'Your ride, your fuel, your police checkpoints.',
    speed: 25,
    baseFare: 0,
    /** Nothing at departure: the trip burns fuel from your tank (`litresForKm`, more in go-slow); you pay at the pump. */
    farePerKm: 0,
    trafficExposure: 0.9,
    energyPerHour: -1.5,
    funPerHour: 1,
    incidentRisk: 0.01,
    maxDistance: 400,
    requiresVehicle: true,
    bannedAcrossLagoon: false,
    cities: BOTH,
  },
  taxi: {
    id: 'taxi',
    label: 'Green cab',
    blurb: 'Abuja’s green-and-white taxis. Agree the price first.',
    speed: 26,
    baseFare: 800,
    farePerKm: 380,
    trafficExposure: 0.6,
    energyPerHour: -2,
    funPerHour: 0,
    incidentRisk: 0.006,
    maxDistance: 60,
    requiresVehicle: false,
    bannedAcrossLagoon: false,
    cities: ABUJA_ONLY,
  },
  bus: {
    id: 'bus',
    label: 'City bus',
    blurb: 'Abuja’s mass-transit buses: orderly, cheap, sometimes slow.',
    speed: 24,
    baseFare: 300,
    farePerKm: 40,
    trafficExposure: 0.45,
    energyPerHour: -3,
    funPerHour: -1,
    incidentRisk: 0.004,
    maxDistance: 60,
    requiresVehicle: false,
    bannedAcrossLagoon: false,
    cities: ABUJA_ONLY,
  },
};

/**
 * Abuja bans okada and keke in the city proper: they run only in the satellite towns (Gwarinpa, Kubwa, Lugbe), and a
 * trip on them must start and end there.
 */
export function isOuterAbujaDistrict(districtId: DistrictId): boolean {
  return cityOfDistrict(districtId) === 'abuja' && DISTRICTS[districtId].side === 'outskirts';
}

/** Why a mode can't make a trip between two districts of one city, or null when it can. */
export function modeUnavailableReason(mode: TransportMode, from: DistrictId, to: DistrictId): string | null {
  const def = TRANSPORT[mode];
  const city = cityOfDistrict(from);
  if (!def.cities.includes(city)) {
    const where = def.cities.map((c) => (c === 'lagos' ? 'Lagos' : 'Abuja')).join(' and ');
    return `${def.label} only runs in ${where}`;
  }
  if (city === 'abuja' && (mode === 'okada' || mode === 'keke') && !(isOuterAbujaDistrict(from) && isOuterAbujaDistrict(to))) {
    return `${def.label} isn’t allowed in Abuja’s city centre. It only runs in Gwarinpa, Kubwa and Lugbe`;
  }
  return null;
}

/** The everyday cheap ride of a city, and the fallback when the mode you picked can't make a trip. */
export function cityDefaultMode(cityId: CityId): TransportMode {
  return cityId === 'abuja' ? 'bus' : 'danfo';
}

/** Modes that run in a city (whatever the trip). */
export function modesInCity(cityId: CityId): readonly TransportMode[] {
  return TRANSPORT_MODES.filter((mode) => TRANSPORT[mode].cities.includes(cityId));
}

/** Roads wind; straight-line distance understates the drive. */
const ROAD_FACTOR = 1.35;
/** Extra minutes for a lagoon crossing (Third Mainland, Carter or Eko bridge). */
const BRIDGE_PENALTY_MINUTES = 15;
/** Minimum trip (finding a ride, walking to the bus stop), in game minutes after pacing. */
const MIN_TRIP_MINUTES = 5;

/** Lagos go-slow multiplier by hour of day (weekday). */
export function trafficMultiplier(hour: number, weekend: boolean, raining: boolean): number {
  let multiplier = 1;
  if (!weekend) {
    if (hour >= 6 && hour < 10) multiplier = 2.2;
    else if (hour >= 16 && hour < 21) multiplier = 2.4;
    else if (hour >= 10 && hour < 16) multiplier = 1.3;
  } else if (hour >= 11 && hour < 20) {
    multiplier = 1.4;
  }
  return raining ? multiplier * 1.4 : multiplier;
}

export interface TripQuote {
  readonly mode: TransportMode;
  readonly distance: number;
  readonly minutes: number;
  readonly fare: number;
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface TripConditions {
  readonly hour: number;
  readonly weekend: boolean;
  readonly raining: boolean;
  /** World price index multiplier for fares (fuel prices). */
  readonly priceIndex: number;
  /** Extra fare multiplier (fuel scarcity, Bolt surge in rain). */
  readonly fareMultiplier?: number;
}

/** Quote a trip between two districts with a given mode. Pure; used by server (authoritative) and client (preview). */
export function quoteTrip(
  from: DistrictId,
  to: DistrictId,
  mode: TransportMode,
  conditions: TripConditions,
): TripQuote {
  const def = TRANSPORT[mode];
  const unavailable = modeUnavailableReason(mode, from, to);
  if (unavailable) return { mode, distance: 0, minutes: 0, fare: 0, allowed: false, reason: unavailable };
  const sameDistrict = from === to;
  const distance = sameDistrict ? 1.2 : districtDistance(from, to) * ROAD_FACTOR;
  const lagoon = !sameDistrict && crossesLagoon(from, to);

  if (distance > def.maxDistance) {
    return { mode, distance, minutes: 0, fare: 0, allowed: false, reason: `${def.label} doesn't go that far` };
  }
  if (lagoon && def.bannedAcrossLagoon) {
    return { mode, distance, minutes: 0, fare: 0, allowed: false, reason: `${def.label} is banned on the bridges` };
  }

  const traffic = 1 + (trafficMultiplier(conditions.hour, conditions.weekend, conditions.raining) - 1) * def.trafficExposure;
  const bridge = lagoon ? BRIDGE_PENALTY_MINUTES * traffic : 0;
  // Speeds are the city's at ×120; a ride keeps its real-time length, so it takes half the game minutes (pacing.ts).
  const minutes = Math.max(MIN_TRIP_MINUTES, Math.round(pacedTripMinutes((distance / def.speed) * 60 * traffic + bridge)));

  const surge = mode === 'bolt' && conditions.raining ? 1.8 : 1;
  const rawFare = (def.baseFare + def.farePerKm * distance) * conditions.priceIndex * surge * (conditions.fareMultiplier ?? 1);
  const fare = def.baseFare === 0 && def.farePerKm === 0 ? 0 : Math.round(rawFare / 50) * 50;

  return { mode, distance, minutes, fare, allowed: true };
}
