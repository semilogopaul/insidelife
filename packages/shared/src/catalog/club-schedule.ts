import { rngFor } from '../random/rng.js';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR, type GameMinute } from '../time/calendar.js';
import { realMsAt, type GameClockConfig } from '../time/clock.js';
import { CLUB_ROTATION_CAPACITY, TRACK_MAX_SECONDS, clubPlayVenues } from './promotions.js';
import type { VenueDefinition } from './venues.js';

/**
 * The club schedule: when paid songs play in every club and lounge. Pure and deterministic (the server publishes it,
 * the audio plays it, the Promote app shows it, and they all agree to the second).
 *
 * - **Slots.** Each club and lounge has paid slots inside its opening hours, every game day, starting on the hour. A
 *   slot is long enough for the longest allowed song plus a little game music (`clubSlotMinutes`: 3 min + 30 s of real
 *   time = 7 game hours at the default ×120 clock), and it ends before closing, so a song always plays in full while the
 *   club is open. Everything outside a slot, and a slot with no song booked, is the club's own game music.
 * - **Lanes.** A booked song holds one of `CLUB_ROTATION_CAPACITY` lanes for its whole run. Slots are numbered in time
 *   order across Lagos; every block of `lanes` consecutive slots gives each lane exactly one slot, and a seeded Latin
 *   square rotates which club each lane gets, so every song gets the same number of plays a day, spread evenly over
 *   every club and lounge (exactly once per club every `lanes` game days when there are as many slots a day as lanes).
 * - **Real time.** Game minutes map to real time through the game clock (`realMsAt`), so a slot has an exact local time.
 */

/** Real seconds of game music after the longest allowed song before the next paid slot can start. */
export const CLUB_SLOT_GAP_SECONDS = 30;
/** Game minutes of game music at least, after a club opens, before its first paid slot. */
export const CLUB_OPENING_LEAD_MINUTES = 60;

export interface ClubSlotTemplate {
  readonly venueId: string;
  /** Game minutes after the game day's midnight (may pass 1,440 for sessions after midnight). */
  readonly offsetMinutes: number;
}

export interface ClubSlot {
  /** Global slot number (game day × slots a day + position in the day). */
  readonly index: number;
  readonly venueId: string;
  readonly startMinute: GameMinute;
  /** Exclusive: the next paid song can't start before this. */
  readonly endMinute: GameMinute;
  readonly lane: number;
}

export interface ClubScheduleOptions {
  /** The world seed (the server's `WORLD_SEED`). */
  readonly seed: string;
  readonly lanes?: number;
  /** Defaults to every club and lounge (`clubPlayVenues()`). */
  readonly venues?: readonly VenueDefinition[];
}

/** Length of a paid slot in game minutes (whole game hours) for a clock running `scale` game minutes per real minute. */
export function clubSlotMinutes(scale: number): number {
  const gameMinutes = ((TRACK_MAX_SECONDS + CLUB_SLOT_GAP_SECONDS) / 60) * scale;
  return Math.max(MINUTES_PER_HOUR, Math.ceil(gameMinutes / MINUTES_PER_HOUR - 1e-9) * MINUTES_PER_HOUR);
}

const templateCache = new Map<string, readonly ClubSlotTemplate[]>();

/**
 * One game day's paid slots across every club, in time order: as many whole slots as fit each club's opening hours
 * after `CLUB_OPENING_LEAD_MINUTES`, spread evenly over the session and starting on the hour.
 */
export function clubSlotTemplate(scale: number, venues: readonly VenueDefinition[] = clubPlayVenues()): readonly ClubSlotTemplate[] {
  const key = `${scale}|${venues.map((venue) => `${venue.id}@${venue.hours?.join('-') ?? 'all'}`).join(',')}`;
  const cached = templateCache.get(key);
  if (cached) return cached;
  const length = clubSlotMinutes(scale);
  const slots: ClubSlotTemplate[] = [];
  for (const venue of [...venues].toSorted((a, b) => a.id.localeCompare(b.id))) {
    const [open, close] = venue.hours ?? [0, 24];
    const span = (close - open) * MINUTES_PER_HOUR;
    const count = Math.max(0, Math.floor((span - CLUB_OPENING_LEAD_MINUTES) / length));
    const slack = span - count * length;
    for (let k = 0; k < count; k++) {
      const share = Math.round((slack * (k + 1)) / (count + 1) / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
      const lead = Math.min(slack, Math.max(Math.min(CLUB_OPENING_LEAD_MINUTES, slack), share));
      slots.push({ venueId: venue.id, offsetMinutes: open * MINUTES_PER_HOUR + lead + k * length });
    }
  }
  const sorted = slots.toSorted((a, b) => a.offsetMinutes - b.offsetMinutes || a.venueId.localeCompare(b.venueId));
  templateCache.set(key, sorted);
  return sorted;
}

const permutationCache = new Map<string, readonly number[]>();

function lanePermutation(seed: string, lanes: number, cycle: number): readonly number[] {
  const key = `${seed}|${lanes}|${cycle}`;
  let permutation = permutationCache.get(key);
  if (!permutation) {
    permutation = rngFor(seed, 'club-lanes', lanes, cycle).shuffle(Array.from({ length: lanes }, (_, lane) => lane));
    if (permutationCache.size > 512) permutationCache.clear();
    permutationCache.set(key, permutation);
  }
  return permutation;
}

/**
 * The lane that owns slot `index`: each block of `lanes` slots gives every lane one slot; within a cycle of `lanes`
 * blocks a lane moves one position per block (a Latin square), and each cycle's lane order is a seeded shuffle.
 */
export function laneOfSlot(index: number, seed: string, lanes: number = CLUB_ROTATION_CAPACITY): number {
  const block = Math.floor(index / lanes);
  const position = index - block * lanes;
  const cycle = Math.floor(block / lanes);
  return lanePermutation(seed, lanes, cycle)[(((position + block) % lanes) + lanes) % lanes] as number;
}

/** Every paid slot overlapping `[fromMinute, toMinute)` (optionally in one club), in time order. */
export function clubSlotsBetween(fromMinute: GameMinute, toMinute: GameMinute, scale: number, options: ClubScheduleOptions & { readonly venueId?: string }): ClubSlot[] {
  const template = clubSlotTemplate(scale, options.venues);
  const lanes = options.lanes ?? CLUB_ROTATION_CAPACITY;
  const length = clubSlotMinutes(scale);
  const perDay = template.length;
  if (perDay === 0 || toMinute <= fromMinute) return [];
  const latestOffset = Math.max(...template.map((slot) => slot.offsetMinutes));
  const firstDay = Math.floor((fromMinute - latestOffset - length) / MINUTES_PER_DAY);
  const lastDay = Math.floor(toMinute / MINUTES_PER_DAY);
  const out: ClubSlot[] = [];
  for (let day = Math.max(0, firstDay); day <= lastDay; day++) {
    template.forEach((slot, position) => {
      if (options.venueId && slot.venueId !== options.venueId) return;
      const startMinute = day * MINUTES_PER_DAY + slot.offsetMinutes;
      const endMinute = startMinute + length;
      if (endMinute <= fromMinute || startMinute >= toMinute) return;
      const index = day * perDay + position;
      out.push({ index, venueId: slot.venueId, startMinute, endMinute, lane: laneOfSlot(index, options.seed, lanes) });
    });
  }
  return out.toSorted((a, b) => a.startMinute - b.startMinute || a.index - b.index);
}

/** The next `count` slots of one lane starting at or after `fromMinute` (searching at most `horizonDays` game days). */
export function nextLaneSlots(lane: number, fromMinute: GameMinute, count: number, scale: number, options: ClubScheduleOptions, horizonDays = 4): ClubSlot[] {
  const found: ClubSlot[] = [];
  const step = MINUTES_PER_DAY;
  for (let from = fromMinute; found.length < count && from < fromMinute + horizonDays * MINUTES_PER_DAY; from += step) {
    for (const slot of clubSlotsBetween(from, from + step, scale, options)) {
      if (slot.lane !== lane || slot.startMinute < fromMinute || found.some((other) => other.index === slot.index)) continue;
      found.push(slot);
      if (found.length >= count) break;
    }
  }
  return found;
}

export interface ClubSongGuarantee {
  /** Paid slots a real day across every club and lounge. */
  readonly slotsPerDay: number;
  /** Average plays a real day for one booked song (each lane's share). */
  readonly playsPerDay: number;
  /** What every real day is guaranteed to give one song, whatever time the day starts on the game clock. */
  readonly minPlaysPerDay: number;
  /** Clubs and lounges it plays in. */
  readonly clubs: number;
  /** Songs in rotation at once. */
  readonly lanes: number;
}

/**
 * What a booked song gets. A real day spans exactly `scale` game days, so it holds `slots a game day × scale` slots;
 * each lane gets an equal share of them, give or take one where a block of slots straddles midnight.
 */
export function clubSongGuarantee(scale: number, lanes: number = CLUB_ROTATION_CAPACITY, venues: readonly VenueDefinition[] = clubPlayVenues()): ClubSongGuarantee {
  const template = clubSlotTemplate(scale, venues);
  const slotsPerDay = Math.round(template.length * scale);
  const playsPerDay = Math.floor(slotsPerDay / lanes);
  return {
    slotsPerDay,
    playsPerDay,
    minPlaysPerDay: Math.max(0, playsPerDay - 1),
    clubs: new Set(template.map((slot) => slot.venueId)).size,
    lanes,
  };
}

/** Real time (ms) a slot starts on this clock. */
export function slotStartMs(clock: GameClockConfig, slot: Pick<ClubSlot, 'startMinute'>): number {
  return Math.round(realMsAt(clock, slot.startMinute));
}
