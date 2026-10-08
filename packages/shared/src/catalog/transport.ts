import { crossesLagoon, districtDistance, type DistrictId } from './geography.js';

export const TRANSPORT_MODES = ['walk', 'okada', 'keke', 'danfo', 'brt', 'bolt', 'car'] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

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
}

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
  },
  car: {
    id: 'car',
    label: 'Own car',
    blurb: 'Your ride, your fuel, your police checkpoints.',
    speed: 25,
    baseFare: 0,
    /** Fuel ≈ ₦1,350/L at ~10 km/L, plus wear. */
    farePerKm: 170,
    trafficExposure: 0.9,
    energyPerHour: -1.5,
    funPerHour: 1,
    incidentRisk: 0.01,
    maxDistance: 400,
    requiresVehicle: true,
    bannedAcrossLagoon: false,
  },
};

/** Roads wind; straight-line distance understates the drive. */
const ROAD_FACTOR = 1.35;
/** Extra minutes for a lagoon crossing (Third Mainland, Carter or Eko bridge). */
const BRIDGE_PENALTY_MINUTES = 15;
/** Minimum trip (finding a ride, walking to the bus stop). */
const MIN_TRIP_MINUTES = 10;

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
  const minutes = Math.max(MIN_TRIP_MINUTES, Math.round((distance / def.speed) * 60 * traffic + bridge));

  const surge = mode === 'bolt' && conditions.raining ? 1.8 : 1;
  const rawFare = (def.baseFare + def.farePerKm * distance) * conditions.priceIndex * surge * (conditions.fareMultiplier ?? 1);
  const fare = def.baseFare === 0 && def.farePerKm === 0 ? 0 : Math.round(rawFare / 50) * 50;

  return { mode, distance, minutes, fare, allowed: true };
}
