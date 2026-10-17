import { MINUTES_PER_DAY, type GameMinute } from '../time/calendar.js';

/**
 * Races between the cities ("Race a friend to Abuja"): friends in one city agree to a race, the clock starts when the last
 * one accepts, and whoever arrives in the other city first (by plane, airliner or coach: any travel counts) wins. No money
 * is staked. The server decides everything; this file holds the numbers and the pure rules both sides share.
 */

/** Most racers in one race, the challenger included. */
export const RACE_MAX_RACERS = 4;
/** A challenge nobody has answered lapses after this many game days. */
export const RACE_INVITE_DAYS = 2;
/** A running race ends (unfinished racers did not finish) this many game days after the clock starts. */
export const RACE_DURATION_DAYS = 3;
export const RACE_INVITE_MINUTES = RACE_INVITE_DAYS * MINUTES_PER_DAY;
export const RACE_DURATION_MINUTES = RACE_DURATION_DAYS * MINUTES_PER_DAY;
/** How many finished races the Race tab keeps showing. */
export const RACE_HISTORY_LIMIT = 5;

/** How a racer got there. */
export const RACE_HOWS = ['private', 'commercial', 'coach'] as const;
export type RaceHow = (typeof RACE_HOWS)[number];

export const RACE_HOW_LABELS: Readonly<Record<RaceHow, string>> = {
  private: 'Private plane',
  commercial: 'Commercial flight',
  coach: 'Interstate coach',
};

/**
 * How a trip that ended in the destination city counts, or null when it is not a way between the cities. A flight with a
 * timetable id is a commercial one; any other flight is a private aircraft.
 */
export function raceHowOf(mode: string, commercialFlight: boolean): RaceHow | null {
  if (mode === 'coach') return 'coach';
  if (mode === 'flight') return commercialFlight ? 'commercial' : 'private';
  return null;
}

export interface RaceFinisher {
  readonly id: string;
  readonly finishedAt: GameMinute | null;
}

/**
 * Places among the racers who have arrived (1 = first). Equal arrival minutes share a place (a dead heat); the next place
 * is skipped, as in any race. Racers who have not arrived have no place.
 */
export function racePlaces(racers: readonly RaceFinisher[]): ReadonlyMap<string, number> {
  const finished = racers.filter((racer): racer is RaceFinisher & { finishedAt: GameMinute } => racer.finishedAt !== null);
  const places = new Map<string, number>();
  for (const racer of finished) places.set(racer.id, 1 + finished.filter((other) => other.finishedAt < racer.finishedAt).length);
  return places;
}

/**
 * Whether the winner is known. Racers settle at different moments (a player who is offline settles when they next show
 * up), so an arrival recorded now may not be the earliest: the winner is decided once somebody has arrived and nobody else
 * is still on a trip that lands at or before the best arrival so far. `pendingArrivals` are the landing minutes of the
 * racers still on their way (trips already under way); a racer with no trip under way cannot land earlier than now.
 */
export function raceDecided(finishTimes: readonly GameMinute[], pendingArrivals: readonly GameMinute[]): boolean {
  if (finishTimes.length === 0) return false;
  const best = Math.min(...finishTimes);
  return pendingArrivals.every((arrival) => arrival > best);
}

/** "1h 12m" style race time: whole minutes, hours when there are any. */
export function formatRaceTime(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return hours === 0 ? `${rest}m` : `${hours}h ${String(rest).padStart(2, '0')}m`;
}
