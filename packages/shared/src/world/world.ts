import {
  BASE_YEAR,
  DAYS_PER_MONTH,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MINUTES_PER_MONTH,
  dayIndexOf,
  fromDateParts,
  seasonOf,
  toDateParts,
  type GameMinute,
  type Season,
} from '../time/calendar.js';
import { hashString, rngFor } from '../random/rng.js';

/**
 * The world model: weather, macro-economy and scheduled world events.
 *
 * Everything here is a pure function of the world seed and game time, evaluated in O(1). Server and client compute
 * identical answers without storing or syncing state, and history never drifts between replicas.
 */

// ---------------------------------------------------------------------------------------------------------------
// Smooth deterministic noise
// ---------------------------------------------------------------------------------------------------------------

function lattice(seed: string, channel: string, i: number): number {
  return (hashString(`${seed}:${channel}:${i}`) / 4294967295) * 2 - 1;
}

/** 1D value noise in [-1, 1], smooth (smoothstep) between integer lattice points. */
function valueNoise(seed: string, channel: string, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const t = f * f * (3 - 2 * f);
  const a = lattice(seed, channel, i);
  const b = lattice(seed, channel, i + 1);
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------------------------------------------
// World events
// ---------------------------------------------------------------------------------------------------------------

export const WORLD_EVENT_KINDS = [
  'asuu-strike',
  'asup-strike',
  'fuel-scarcity',
  'devaluation',
  'grid-collapse',
  'detty-december',
  'public-holiday',
  'election-season',
] as const;
export type WorldEventKind = (typeof WORLD_EVENT_KINDS)[number];

export interface WorldEvent {
  readonly id: string;
  readonly kind: WorldEventKind;
  readonly title: string;
  readonly description: string;
  readonly startsAt: GameMinute;
  readonly endsAt: GameMinute;
}

const FIXED_HOLIDAYS: ReadonlyArray<{ month: number; day: number; title: string; days?: number }> = [
  { month: 1, day: 1, title: 'New Year’s Day' },
  { month: 4, day: 3, title: 'Easter', days: 2 },
  { month: 5, day: 1, title: 'Workers’ Day' },
  { month: 6, day: 12, title: 'Democracy Day' },
  { month: 10, day: 1, title: 'Independence Day' },
  { month: 12, day: 25, title: 'Christmas & Boxing Day', days: 2 },
];

const yearCache = new Map<string, readonly WorldEvent[]>();

/** All world events that *start* in a given game year. */
export function worldEventsForYear(seed: string, year: number): readonly WorldEvent[] {
  const key = `${seed}:${year}`;
  const cached = yearCache.get(key);
  if (cached) return cached;

  const rng = rngFor(seed, 'world-events', year);
  const events: WorldEvent[] = [];
  const at = (month: number, day: number): GameMinute => fromDateParts({ year, month, day });
  const lengthDays = (days: number): number => days * MINUTES_PER_DAY;

  for (const holiday of FIXED_HOLIDAYS) {
    const startsAt = at(holiday.month, holiday.day);
    events.push({
      id: `${year}-holiday-${holiday.month}-${holiday.day}`,
      kind: 'public-holiday',
      title: holiday.title,
      description: 'Public holiday — no work or lectures today.',
      startsAt,
      endsAt: startsAt + lengthDays(holiday.days ?? 1),
    });
  }

  // Eid moves around the calendar; two Sallah holidays per year.
  for (const label of ['Eid al-Fitr', 'Eid al-Adha'] as const) {
    const month = rng.int(1, 12);
    const day = rng.int(1, DAYS_PER_MONTH - 1);
    const startsAt = at(month, day);
    events.push({
      id: `${year}-holiday-${label}`,
      kind: 'public-holiday',
      title: `${label} (Sallah)`,
      description: 'Sallah break — ram meat everywhere.',
      startsAt,
      endsAt: startsAt + lengthDays(2),
    });
  }

  const detty = at(12, 1);
  events.push({
    id: `${year}-detty-december`,
    kind: 'detty-december',
    title: 'Detty December',
    description: 'The diaspora is home. Parties every night, prices up, traffic worse.',
    startsAt: detty,
    endsAt: detty + MINUTES_PER_MONTH,
  });

  if (rng.chance(0.4)) {
    const startsAt = at(rng.int(1, 11), rng.int(1, DAYS_PER_MONTH));
    const months = rng.weighted([
      { value: 1, weight: 25 },
      { value: 2, weight: 20 },
      { value: 3, weight: 18 },
      { value: 5, weight: 15 },
      { value: 6, weight: 10 },
      { value: 8, weight: 12 },
    ]);
    events.push({
      id: `${year}-asuu`,
      kind: 'asuu-strike',
      title: 'ASUU strike',
      description: `Lecturers at federal and state universities have downed tools (≈${months} month${months > 1 ? 's' : ''}). Graduation dates slip.`,
      startsAt,
      endsAt: startsAt + months * MINUTES_PER_MONTH,
    });
  }

  if (rng.chance(0.25)) {
    const startsAt = at(rng.int(1, 12), rng.int(1, DAYS_PER_MONTH));
    const months = rng.int(1, 3);
    events.push({
      id: `${year}-asup`,
      kind: 'asup-strike',
      title: 'ASUP strike',
      description: 'Polytechnic lecturers are on strike.',
      startsAt,
      endsAt: startsAt + months * MINUTES_PER_MONTH,
    });
  }

  for (let quarter = 0; quarter < 4; quarter++) {
    if (!rng.chance(0.3)) continue;
    const startsAt = at(quarter * 3 + rng.int(1, 3), rng.int(1, DAYS_PER_MONTH));
    events.push({
      id: `${year}-fuel-${quarter}`,
      kind: 'fuel-scarcity',
      title: 'Fuel scarcity',
      description: 'Queues at every filling station. Transport fares and generator costs jump.',
      startsAt,
      endsAt: startsAt + lengthDays(rng.int(10, 35)),
    });
  }

  for (let month = 1; month <= 12; month++) {
    if (!rng.chance(0.12)) continue;
    const startsAt = at(month, rng.int(1, DAYS_PER_MONTH)) + rng.int(0, 20) * MINUTES_PER_HOUR;
    events.push({
      id: `${year}-grid-${month}`,
      kind: 'grid-collapse',
      title: 'National grid collapse',
      description: 'The grid don collapse again. Generators roaring everywhere.',
      startsAt,
      endsAt: startsAt + lengthDays(rng.int(1, 4)),
    });
  }

  if (rng.chance(0.18)) {
    const startsAt = at(rng.int(1, 12), rng.int(1, DAYS_PER_MONTH));
    events.push({
      id: `${year}-devaluation`,
      kind: 'devaluation',
      title: 'Naira devaluation',
      description: 'The CBN adjusted the exchange rate overnight. Imported goods cost more.',
      startsAt,
      endsAt: startsAt + 4 * MINUTES_PER_MONTH,
    });
  }

  if ((year - BASE_YEAR) % 4 === 0) {
    const startsAt = at(1, 15);
    events.push({
      id: `${year}-election`,
      kind: 'election-season',
      title: 'Election season',
      description: 'Rallies, stomach infrastructure and movement restrictions on voting day.',
      startsAt,
      endsAt: startsAt + 2 * MINUTES_PER_MONTH,
    });
  }

  events.sort((a, b) => a.startsAt - b.startsAt);
  if (yearCache.size > 64) yearCache.clear();
  yearCache.set(key, events);
  return events;
}

/** World events active at game time `t` (events can spill over from the previous year). */
export function activeWorldEvents(seed: string, t: GameMinute): WorldEvent[] {
  const { year } = toDateParts(t);
  const candidates = [...worldEventsForYear(seed, year - 1), ...worldEventsForYear(seed, year)];
  return candidates.filter((event) => event.startsAt <= t && t < event.endsAt);
}

export function isWorldEventActive(seed: string, t: GameMinute, kind: WorldEventKind): boolean {
  return activeWorldEvents(seed, t).some((event) => event.kind === kind);
}

/** Total minutes of a given event kind overlapping [from, to) — e.g. strike time during a degree. */
export function worldEventMinutesBetween(seed: string, kind: WorldEventKind, from: GameMinute, to: GameMinute): number {
  if (to <= from) return 0;
  const firstYear = toDateParts(from).year - 1;
  const lastYear = toDateParts(to).year;
  let total = 0;
  for (let year = firstYear; year <= lastYear; year++) {
    for (const event of worldEventsForYear(seed, year)) {
      if (event.kind !== kind) continue;
      const start = Math.max(event.startsAt, from);
      const end = Math.min(event.endsAt, to);
      if (end > start) total += end - start;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------------------------------------------

export interface EconomyState {
  /** Multiplier on consumer prices (1 = catalog price). */
  readonly priceIndex: number;
  /** Naira per US dollar (parallel market). */
  readonly usdRate: number;
  /** Naira per British pound. */
  readonly gbpRate: number;
  /** Petrol price per litre (₦). */
  readonly fuelPrice: number;
  /** Annualised 1-year T-bill yield. */
  readonly tbillRate: number;
  /** Annualised bank savings rate. */
  readonly savingsRate: number;
  /** Annualised money-market fund rate. */
  readonly moneyMarketRate: number;
  /** Extra transport fare multiplier from fuel scarcity. */
  readonly fareMultiplier: number;
}

/** Economy on a given world day. Mean-reverting by construction; shocks come from world events. */
export function economyOn(seed: string, dayIndex: number): EconomyState {
  const t = dayIndex * MINUTES_PER_DAY + MINUTES_PER_DAY / 2;
  const events = activeWorldEvents(seed, t);
  const fuelScarcity = events.some((e) => e.kind === 'fuel-scarcity');
  const detty = events.some((e) => e.kind === 'detty-december');
  const devaluation = events.find((e) => e.kind === 'devaluation');

  const slow = valueNoise(seed, 'price-slow', dayIndex / 60);
  const fast = valueNoise(seed, 'price-fast', dayIndex / 9);
  let priceIndex = 1 + 0.1 * slow + 0.03 * fast;
  if (detty) priceIndex *= 1.08;
  if (fuelScarcity) priceIndex *= 1.05;

  let devaluationFactor = 1;
  if (devaluation) {
    const progress = (t - devaluation.startsAt) / (devaluation.endsAt - devaluation.startsAt);
    devaluationFactor = 1 + 0.25 * (1 - progress);
    priceIndex *= 1 + 0.08 * (1 - progress);
  }

  const usdRate = Math.round(
    1360 * (1 + 0.07 * valueNoise(seed, 'fx-slow', dayIndex / 75) + 0.02 * valueNoise(seed, 'fx-fast', dayIndex / 7)) *
      devaluationFactor,
  );
  const fuelPrice = Math.round(1350 * (1 + 0.08 * valueNoise(seed, 'fuel', dayIndex / 30)) * (fuelScarcity ? 1.6 : 1));
  const tbillRate = 0.11 + 0.025 * valueNoise(seed, 'rates', dayIndex / 120);

  return {
    priceIndex: Math.round(Math.min(1.4, Math.max(0.82, priceIndex)) * 1000) / 1000,
    usdRate,
    gbpRate: Math.round(usdRate * 1.31),
    fuelPrice,
    tbillRate: Math.round(tbillRate * 10000) / 10000,
    savingsRate: Math.round((tbillRate * 0.32) * 10000) / 10000,
    moneyMarketRate: Math.round((tbillRate * 0.68) * 10000) / 10000,
    fareMultiplier: fuelScarcity ? 1.35 : 1,
  };
}

export function economyAt(seed: string, t: GameMinute): EconomyState {
  return economyOn(seed, dayIndexOf(t));
}

// ---------------------------------------------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------------------------------------------

export const WEATHER_CONDITIONS = ['clear', 'cloudy', 'rain', 'storm', 'haze'] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

export interface Weather {
  readonly condition: WeatherCondition;
  /** 0-1 strength (rain density, haze thickness). */
  readonly intensity: number;
  readonly raining: boolean;
  readonly temperatureC: number;
  readonly season: Season;
}

const WEATHER_BLOCK_MINUTES = 3 * MINUTES_PER_HOUR;

const SEASON_WEATHER: Readonly<Record<Season, { rain: number; storm: number; cloudy: number; haze: number }>> = {
  harmattan: { rain: 0.01, storm: 0, cloudy: 0.1, haze: 0.7 },
  dry: { rain: 0.06, storm: 0.02, cloudy: 0.25, haze: 0.05 },
  rainy: { rain: 0.3, storm: 0.12, cloudy: 0.35, haze: 0 },
  'august-break': { rain: 0.1, storm: 0.02, cloudy: 0.45, haze: 0 },
  'detty-december': { rain: 0.02, storm: 0, cloudy: 0.15, haze: 0.35 },
};

/** Weather for the 3-hour block containing `t`. */
export function weatherAt(seed: string, t: GameMinute): Weather {
  const block = Math.floor(t / WEATHER_BLOCK_MINUTES);
  const season = seasonOf(t);
  const odds = SEASON_WEATHER[season];
  const rng = rngFor(seed, 'weather', block);
  // Weather is sticky: blend this block's roll with the previous block's so storms last.
  const roll = (rng.next() + rngFor(seed, 'weather', block - 1).next()) / 2;
  const hour = toDateParts(t).hour;

  let condition: WeatherCondition = 'clear';
  if (roll < odds.storm) condition = 'storm';
  else if (roll < odds.storm + odds.rain) condition = 'rain';
  else if (roll < odds.storm + odds.rain + odds.haze) condition = 'haze';
  else if (roll < odds.storm + odds.rain + odds.haze + odds.cloudy) condition = 'cloudy';

  const intensity = condition === 'storm' ? rng.float(0.75, 1) : condition === 'clear' ? 0 : rng.float(0.3, 0.75);
  const daytimeWarmth = Math.sin(((hour - 6) / 24) * Math.PI * 2) * 4;
  const seasonBase = season === 'harmattan' ? 27 : season === 'rainy' ? 26 : 30;
  const temperatureC = Math.round(seasonBase + daytimeWarmth - (condition === 'rain' || condition === 'storm' ? 3 : 0));

  return {
    condition,
    intensity,
    raining: condition === 'rain' || condition === 'storm',
    temperatureC,
    season,
  };
}

/** Heavy rain on a given day floods a district with this probability factor applied. */
export function isFloodDay(seed: string, dayIndex: number, floodRisk: number): boolean {
  const t = dayIndex * MINUTES_PER_DAY;
  let stormBlocks = 0;
  for (let block = 0; block < 8; block++) {
    if (weatherAt(seed, t + block * WEATHER_BLOCK_MINUTES).condition === 'storm') stormBlocks++;
  }
  if (stormBlocks === 0) return false;
  return rngFor(seed, 'flood', dayIndex).chance(Math.min(1, floodRisk * stormBlocks * 1.5));
}
