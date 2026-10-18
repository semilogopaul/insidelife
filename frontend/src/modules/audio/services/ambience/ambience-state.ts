import {
  DISTRICTS,
  activeWorldEvents,
  dayIndexOf,
  hashString,
  toDateParts,
  weatherAt,
  type DistrictId,
  type GameMinute,
  type VenueType,
} from '@insidelife/shared';
import { sceneHour } from '@/common/game/daylight';

/**
 * What the city should sound like right now — a pure function of game time, the world seed and where the player
 * is. The ambience mixer turns these targets into smoothed bed levels and random one-shots.
 */

export type SceneKind = 'menu' | 'street' | 'inside';
export type PlaceType = VenueType | 'home';

export interface AmbienceInputs {
  readonly gameMinute: GameMinute;
  readonly worldSeed: string;
  readonly kind: SceneKind;
  readonly placeType: PlaceType | null;
  readonly districtId: DistrictId | null;
  /** Driving (engine covers some of the street; windows up muffle the rest). */
  readonly driving: boolean;
  /** Sound the morning the world is drawn in (`common/game/daylight`), not the game hour. */
  readonly alwaysDaylight?: boolean;
}

export interface AmbienceTargets {
  /** -Infinity = off. */
  readonly trafficDb: number;
  readonly trafficCutoffHz: number;
  readonly hornsPerMinute: number;
  readonly kekesPerMinute: number;
  /** Distant one-shots are heard through walls. */
  readonly muffled: boolean;
  readonly rainDb: number;
  /** Rain on the (zinc) roof rather than on the street. */
  readonly rainIndoor: boolean;
  readonly thunderPerMinute: number;
  readonly insectsDb: number;
  readonly frogsPerMinute: number;
  readonly generatorDb: number;
  readonly generatorIndoor: boolean;
  readonly roomToneDb: number;
}

const OFF = Number.NEGATIVE_INFINITY;

export const SILENT_AMBIENCE: AmbienceTargets = {
  trafficDb: OFF,
  trafficCutoffHz: 400,
  hornsPerMinute: 0,
  kekesPerMinute: 0,
  muffled: false,
  rainDb: OFF,
  rainIndoor: false,
  thunderPerMinute: 0,
  insectsDb: OFF,
  frogsPerMinute: 0,
  generatorDb: OFF,
  generatorIndoor: false,
  roomToneDb: OFF,
};

/** Districts on the lagoon shore (frogs and louder insects at night). */
const LAGOON_DISTRICTS: ReadonlySet<DistrictId> = new Set(['yaba', 'lagos-island', 'ikoyi', 'banana-island', 'lekki', 'ikorodu', 'epe']);

/** Loud venues where the room is the music (no room tone, no street). */
const LOUD_PLACES: ReadonlySet<PlaceType> = new Set(['club', 'bar', 'event-centre', 'hotel']);

export const isNightHour = (hour: number): boolean => hour >= 19 || hour < 6;
export const isRushHour = (hour: number): boolean => (hour >= 6 && hour < 10) || (hour >= 16 && hour < 21);

/**
 * Deterministic NEPA approximation: a district gets `gridHours` of supply per day in 2-hour blocks, chosen by hash
 * per (seed, district, day). Same answer on every client; no state.
 */
export function hasGridPower(seed: string, districtId: DistrictId, t: GameMinute): boolean {
  const gridHours = DISTRICTS[districtId]?.gridHours ?? 12;
  const supplyBlocks = Math.round(Math.min(24, Math.max(0, gridHours)) / 2);
  if (supplyBlocks >= 12) return true;
  if (supplyBlocks <= 0) return false;
  const day = dayIndexOf(t);
  const block = Math.floor(toDateParts(t).hour / 2);
  const score = (b: number): number => hashString(`${seed}:grid:${districtId}:${day}:${b}`);
  const mine = score(block);
  let higher = 0;
  for (let b = 0; b < 12; b++) if (b !== block && score(b) > mine) higher += 1;
  return higher < supplyBlocks;
}

export function deriveAmbience(inputs: AmbienceInputs): AmbienceTargets {
  if (inputs.kind === 'menu') return SILENT_AMBIENCE;
  const { gameMinute: t, worldSeed: seed, placeType, districtId } = inputs;
  const parts = toDateParts(t);
  const hour = sceneHour(parts.hour + parts.minute / 60, inputs.alwaysDaylight ?? false);
  const night = isNightHour(hour);
  const deepNight = hour >= 0 && hour < 5;
  const rush = isRushHour(hour);
  const weather = weatherAt(seed, t);
  const events = activeWorldEvents(seed, t);
  const gridCollapse = events.some((event) => event.kind === 'grid-collapse');
  const detty = events.some((event) => event.kind === 'detty-december');
  const fuelScarcity = events.some((event) => event.kind === 'fuel-scarcity');
  const lagoon = districtId !== null && LAGOON_DISTRICTS.has(districtId);
  const inside = inputs.kind === 'inside';
  const loud = inside && placeType !== null && LOUD_PLACES.has(placeType);

  // Traffic density: rush hour thick, deep night thin; Detty December busier, fuel scarcity emptier.
  let trafficDb = rush ? -6 : deepNight ? -20 : night ? -14 : -9;
  if (detty) trafficDb += 2;
  if (fuelScarcity) trafficDb -= 3;
  let hornsPerMinute = rush ? 7 : deepNight ? 0.3 : night ? 1.5 : 4;
  if (detty) hornsPerMinute *= 1.5;
  if (weather.raining) hornsPerMinute *= 1.3; // everyone honks in the rain
  let kekesPerMinute = night ? 0.2 : rush ? 1.4 : 1;
  let trafficCutoffHz = rush ? 620 : night ? 330 : 470;

  if (inputs.driving) {
    trafficDb -= 4;
    kekesPerMinute *= 0.5;
  }
  if (inside) {
    trafficDb = loud ? OFF : trafficDb - 18;
    trafficCutoffHz = 190;
    hornsPerMinute = loud ? 0 : hornsPerMinute * 0.35;
    kekesPerMinute = 0;
  }

  const rainDb = weather.raining ? (inside ? (loud ? OFF : -17) : -15) + weather.intensity * 8 : OFF;
  const thunderPerMinute = weather.condition === 'storm' ? (inside ? 0.8 : 1.3) : 0;

  const insectsDb = !night ? OFF : inside ? (placeType === 'home' && lagoon ? -34 : OFF) : lagoon ? -21 : -28;
  const frogsPerMinute = night && !inside && lagoon && !inputs.driving ? 4 : 0;

  // Generators: everyone's "I-pass-my-neighbour" at night when the grid collapses; at home when NEPA takes light.
  let generatorDb = OFF;
  let generatorIndoor = false;
  const noLight = districtId !== null && !hasGridPower(seed, districtId, t);
  if (inside && !loud && night && (gridCollapse || (placeType === 'home' && noLight))) {
    generatorDb = placeType === 'home' ? -19 : -23;
    generatorIndoor = true;
  } else if (!inside && gridCollapse) {
    generatorDb = night ? -24 : -31;
  } else if (!inside && night && noLight && !inputs.driving) {
    generatorDb = -30;
  }

  const roomToneDb = !inside || loud ? OFF : placeType === 'hospital-public' || placeType === 'hospital-private' ? -30 : -36;

  return {
    trafficDb,
    trafficCutoffHz,
    hornsPerMinute,
    kekesPerMinute,
    muffled: inside,
    rainDb,
    rainIndoor: inside,
    thunderPerMinute,
    insectsDb,
    frogsPerMinute,
    generatorDb,
    generatorIndoor,
    roomToneDb,
  };
}
