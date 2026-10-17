/** Race API contracts: "Race a friend to Abuja" in the Flights app. Owned by the races domain. */
import type { GameMinute } from '../time/calendar.js';
import type { CityId } from '../catalog/geography.js';
import type { RaceHow } from '../catalog/races.js';

/** `pending` = waiting for answers, `running` = clock started, then `finished` (everyone arrived), `expired` or `cancelled`. */
export type RaceStatus = 'pending' | 'running' | 'finished' | 'expired' | 'cancelled';
export type RacerStatus = 'invited' | 'accepted' | 'declined' | 'finished';

export interface RaceRacerDto {
  readonly characterId: string;
  readonly handle: string;
  readonly name: string;
  readonly isYou: boolean;
  readonly isChallenger: boolean;
  readonly status: RacerStatus;
  /** Game minute they arrived at, or null. */
  readonly finishedAt: GameMinute | null;
  /** Minutes from the start to their arrival. */
  readonly elapsedMinutes: number | null;
  readonly how: RaceHow | null;
  /** "Gulfstream G650ER · 5N-ABC", "Air Peace P4 7102", "Interstate coach". */
  readonly howLabel: string | null;
  /** 1 = first, among those who arrived (a tie shares a place). Null until they arrive. */
  readonly place: number | null;
  /** They won (first place) once the winner is known. */
  readonly winner: boolean;
}

export interface RaceDto {
  readonly id: string;
  readonly status: RaceStatus;
  readonly fromCity: CityId;
  readonly toCity: CityId;
  readonly challengerId: string;
  readonly createdAt: GameMinute;
  /** When the clock started (the last acceptance), or null while waiting. */
  readonly startedAt: GameMinute | null;
  /** The invitation lapses (pending) or the race ends (running) at this game minute. */
  readonly expiresAt: GameMinute;
  /** The winner is known (somebody arrived first and nobody can still beat them). */
  readonly decided: boolean;
  readonly racers: readonly RaceRacerDto[];
}

/** A friend you could challenge. */
export interface RaceFriendDto {
  readonly characterId: string;
  readonly handle: string;
  readonly name: string;
  /** Where they are right now, a city (null while travelling). */
  readonly cityId: CityId | null;
  /** You can challenge them now, or why not. */
  readonly available: boolean;
  readonly reason: string | null;
}

export interface RacesOverviewDto {
  /** The race you are in (waiting or running), if any. */
  readonly active: RaceDto | null;
  /** Challenges waiting for your answer. */
  readonly invitations: readonly RaceDto[];
  /** Races that are over, newest first. */
  readonly recent: readonly RaceDto[];
  readonly friends: readonly RaceFriendDto[];
  /** You can start a race now (you are in a city, not travelling, not already racing), or why not. */
  readonly canChallenge: boolean;
  readonly blocker: string | null;
  readonly cityId: CityId;
  readonly toCity: CityId;
  readonly maxRacers: number;
  readonly durationDays: number;
}

export interface CreateRaceRequest {
  /** Friends to challenge (character ids): one to three. */
  readonly friendIds: readonly string[];
  readonly idempotencyKey?: string;
}

export interface RaceResultDto {
  readonly race: RaceDto;
  readonly overview: RacesOverviewDto;
}
