import type { AircraftClass } from '../contract';

/**
 * The shape of a flight: take-off, climb, cruise, descent, landing, as pure functions of progress (0..1) so the 3D scene,
 * the captions and the tests share one timeline. Piston planes climb slowly and cruise low; jets climb steeply and cruise
 * high above the cloud.
 */

export type FlightPhase = 'takeoff' | 'climb' | 'cruise' | 'descent' | 'landing';

export interface FlightProfile {
  /** Share of the flight in each phase (they add up to 1). */
  readonly shares: Readonly<Record<FlightPhase, number>>;
  /** Cruise altitude in scene units. */
  readonly cruise: number;
  /** Cruise speed in scene units per second. */
  readonly speed: number;
  /** Nose-up angle while climbing (radians). */
  readonly climbPitch: number;
}

const PROFILES: Readonly<Record<AircraftClass, FlightProfile>> = {
  'piston-single': { shares: { takeoff: 0.14, climb: 0.26, cruise: 0.3, descent: 0.18, landing: 0.12 }, cruise: 90, speed: 34, climbPitch: 0.1 },
  'piston-twin': { shares: { takeoff: 0.13, climb: 0.25, cruise: 0.32, descent: 0.18, landing: 0.12 }, cruise: 110, speed: 40, climbPitch: 0.11 },
  turboprop: { shares: { takeoff: 0.12, climb: 0.22, cruise: 0.36, descent: 0.18, landing: 0.12 }, cruise: 150, speed: 50, climbPitch: 0.14 },
  'light-jet': { shares: { takeoff: 0.1, climb: 0.2, cruise: 0.42, descent: 0.18, landing: 0.1 }, cruise: 210, speed: 62, climbPitch: 0.17 },
  'midsize-jet': { shares: { takeoff: 0.1, climb: 0.2, cruise: 0.42, descent: 0.18, landing: 0.1 }, cruise: 230, speed: 68, climbPitch: 0.18 },
  'long-range-jet': { shares: { takeoff: 0.09, climb: 0.2, cruise: 0.44, descent: 0.18, landing: 0.09 }, cruise: 260, speed: 78, climbPitch: 0.19 },
  'airliner-jet': { shares: { takeoff: 0.1, climb: 0.2, cruise: 0.42, descent: 0.18, landing: 0.1 }, cruise: 250, speed: 74, climbPitch: 0.16 },
};

export const flightProfile = (cls: AircraftClass): FlightProfile => PROFILES[cls];

const PHASES: readonly FlightPhase[] = ['takeoff', 'climb', 'cruise', 'descent', 'landing'];

export interface FlightState {
  readonly phase: FlightPhase;
  /** 0..1 within the phase. */
  readonly k: number;
  /** 0 on the ground, 1 at cruise altitude. */
  readonly altitude: number;
  /** Nose-up angle (radians); negative flares are not modelled. */
  readonly pitch: number;
  /** Fraction of cruise speed. */
  readonly speed: number;
  /** 1 with the city plainly in view (on the ground, low), 0 above the haze. */
  readonly city: number;
  /** 0..1: how much cloud there is round the plane (builds up through the climb, thins in the descent). */
  readonly cloud: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

/** Where the flight is at `progress` (0..1). */
export function flightAt(progress: number, cls: AircraftClass): FlightState {
  const profile = PROFILES[cls];
  const p = clamp01(progress);
  let start = 0;
  let phase: FlightPhase = 'landing';
  let k = 1;
  for (const candidate of PHASES) {
    const share = profile.shares[candidate];
    if (p <= start + share || candidate === 'landing') {
      phase = candidate;
      k = share > 0 ? clamp01((p - start) / share) : 1;
      break;
    }
    start += share;
  }
  let altitude = 0;
  let pitch = 0;
  let speed = 1;
  switch (phase) {
    case 'takeoff':
      // Roll accelerating, rotate in the last third and lift off.
      speed = 0.12 + 0.88 * smooth(k);
      altitude = 0.1 * smooth((k - 0.7) / 0.3);
      pitch = profile.climbPitch * smooth((k - 0.6) / 0.4);
      break;
    case 'climb':
      altitude = 0.1 + 0.9 * smooth(k);
      pitch = profile.climbPitch * (1 - smooth((k - 0.7) / 0.3));
      break;
    case 'cruise':
      altitude = 1;
      break;
    case 'descent':
      altitude = 1 - 0.92 * smooth(k);
      pitch = -profile.climbPitch * 0.45 * Math.sin(Math.PI * Math.min(1, k * 1.15));
      break;
    case 'landing':
      // Final approach, flare, touchdown at k ≈ 0.45, then the roll-out.
      altitude = 0.08 * (1 - smooth(k / 0.45));
      pitch = k < 0.45 ? profile.climbPitch * 0.4 * smooth(k / 0.45) : profile.climbPitch * 0.4 * (1 - smooth((k - 0.45) / 0.2));
      speed = k < 0.45 ? 0.55 : 0.55 * (1 - smooth((k - 0.45) / 0.55));
      break;
  }
  return {
    phase,
    k,
    altitude,
    pitch,
    speed,
    city: 1 - smooth((altitude - 0.12) / 0.5),
    cloud: Math.sin(Math.PI * smooth(altitude * 1.05)) * 0.85 + (altitude >= 0.99 ? 0.15 : 0),
  };
}

const STEPS = 256;
const distanceTables = new Map<AircraftClass, Float32Array>();

/** Distance flown (scene units) by `progress` over a flight of `seconds`; monotonic, 0 at the start. */
export function flightDistance(progress: number, cls: AircraftClass, seconds: number): number {
  let table = distanceTables.get(cls);
  if (!table) {
    table = new Float32Array(STEPS + 1);
    let sum = 0;
    for (let i = 1; i <= STEPS; i++) {
      sum += flightAt((i - 0.5) / STEPS, cls).speed / STEPS;
      table[i] = sum;
    }
    distanceTables.set(cls, table);
  }
  const x = clamp01(progress) * STEPS;
  const i = Math.min(STEPS - 1, Math.floor(x));
  const value = (table[i] as number) + ((table[i + 1] as number) - (table[i] as number)) * (x - i);
  return value * PROFILES[cls].speed * seconds;
}

/** Captions for each phase, shown by the overlay. */
export const PHASE_CAPTION: Readonly<Record<FlightPhase, string>> = {
  takeoff: 'Taking off',
  climb: 'Climbing',
  cruise: 'Cruising',
  descent: 'Descending',
  landing: 'Landing',
};

/** Progress at which each phase starts (for scheduling captions). */
export function phaseStarts(cls: AircraftClass): Readonly<Record<FlightPhase, number>> {
  const shares = PROFILES[cls].shares;
  let start = 0;
  const out = {} as Record<FlightPhase, number>;
  for (const phase of PHASES) {
    out[phase] = start;
    start += shares[phase];
  }
  return out;
}
