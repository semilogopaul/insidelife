import type {
  ActionDefinition,
  ActivityKind,
  CharacterSummaryDto,
  GameMinute,
  NeedProfile,
  ProfileContext,
  TimelineSegmentDto,
} from '@insidelife/shared';
import type { ActivityState, TravelState } from '../../characters/entities/character.entity.js';
import type { SimulationContext } from '../simulation-context.js';
import type { RowProbe } from '../row-presence.js';

/**
 * A block a domain system puts on the character's daily routine (work shift, lectures, hospital stay, trip).
 * Blocks only take effect when the character has no explicit action and is not travelling.
 */
export interface ScheduleBlock {
  readonly kind: Extract<ActivityKind, 'work' | 'lecture' | 'away' | 'hospital'>;
  readonly startsAt: GameMinute;
  readonly endsAt: GameMinute;
  readonly locationId: string;
  readonly label: string;
  /** Higher wins when blocks overlap (hospital > away > work > lecture). */
  readonly priority: number;
  /** Whether getting there needs a commute segment (false for hospital admissions, trips abroad). */
  readonly commute: boolean;
}

/** Where the character sleeps tonight (family home, rented flat, hostel during session…). */
export interface Residence {
  readonly locationId: string;
  readonly districtId: string;
  readonly regionId: string;
  readonly label: string;
  /**
   * Higher wins when several systems offer a residence (hostel during an out-of-town session = 20, a hospital ward
   * = 30, your own/rented home = 10). Defaults to 10.
   */
  readonly priority?: number;
}

/** One planned or applied span of time with constant need drift. */
export interface Segment extends TimelineSegmentDto {
  readonly kind: ActivityKind;
}

/** Partial summary a system contributes to the snapshot. */
export type SummaryContribution = Partial<Omit<CharacterSummaryDto, 'netWorth' | 'conditions'>> & {
  readonly conditions?: CharacterSummaryDto['conditions'];
};

/**
 * Domain systems plug into the engine through this interface (all hooks optional). Each domain module registers its
 * system with `SimulationRegistry` on startup. Hooks run inside the character's locked transaction, in `order`.
 *
 * Rules for implementers:
 * - Use `ctx.manager` for all DB access (same transaction) and `ctx.rng(...)` for all randomness.
 * - Move money only through `ctx.wallet`.
 * - Never throw for routine bad luck (can't afford rent → eviction, not an exception).
 */
export interface SimulationSystem {
  readonly key: string;
  /** Lower runs first. Core systems use 0-99, domains 100+. */
  readonly order: number;

  /**
   * Existence checks for this system's per-character loads that usually find nothing (see `RowProbe`). Guard each load
   * with `ctx.mayHaveRows(probe)`; one query per session answers every probe.
   */
  readonly rowProbes?: readonly RowProbe[];

  /** Initialise domain state for a brand-new character (family, WAEC result, starting home…). */
  onCharacterCreated?(ctx: SimulationContext): Promise<void>;

  /** Routine blocks for a given game day (cached per day by the engine). */
  scheduleForDay?(ctx: SimulationContext, dayIndex: number): Promise<readonly ScheduleBlock[]>;

  /** Override the default residence (e.g. hostel during an out-of-town session). Highest `priority` wins. */
  residence?(ctx: SimulationContext, t: GameMinute): Promise<Residence | null>;

  /** Adjust the profile context (home comfort, bed quality, job stress, illness energy caps). */
  profileContext?(ctx: SimulationContext, base: ProfileContext): Promise<ProfileContext>;

  /** Called for every applied segment (attendance, study progress, exposure risks). */
  onSegment?(ctx: SimulationContext, segment: Segment): Promise<void>;

  /** An explicit action finished (not cancelled). */
  onActionComplete?(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void>;

  /** A trip finished. */
  onArrival?(ctx: SimulationContext, travel: TravelState): Promise<void>;

  /** End of a game day (`dayIndex` is the day that just ended). */
  onDayEnd?(ctx: SimulationContext, dayIndex: number): Promise<void>;

  /** End of a game month (`monthIndex` = whole months since the calendar origin, the month that just ended). */
  onMonthEnd?(ctx: SimulationContext, monthIndex: number): Promise<void>;

  /** Contribution to the snapshot summary. */
  summarize?(ctx: SimulationContext): Promise<SummaryContribution>;

  /** Value of assets this system owns (property, vehicles, investments) for net worth. */
  netWorth?(ctx: SimulationContext): Promise<number>;

  /** Status (clout) contribution from this system's assets and titles. */
  status?(ctx: SimulationContext): Promise<number>;

  /** Multiplier on daily living costs (e.g. 0.5 while living in the family house). Multipliers compound. */
  livingCostMultiplier?(ctx: SimulationContext): Promise<number>;

  /** Item tags the character owns (unlock actions like `tv`, `laptop`). */
  itemTags?(ctx: SimulationContext): Promise<readonly string[]>;

  /** Life events awaiting a decision (shown as a badge in the HUD). */
  pendingEventCount?(ctx: SimulationContext): Promise<number>;

  /** The character died: settle estates, notify family. */
  onDeath?(ctx: SimulationContext): Promise<void>;

  /** A life-event card was resolved (by the player or by its default on expiry). */
  onLifeEventResolved?(ctx: SimulationContext, resolution: LifeEventResolution): Promise<void>;

  /** Every settlement finished (cheap upkeep such as refreshing caches; keep it O(1) and memoised). */
  onSettled?(ctx: SimulationContext): Promise<void>;
}

export interface LifeEventResolution {
  readonly eventId: string;
  readonly choiceId: string;
  readonly tone: 'good' | 'bad' | 'neutral';
  readonly moneyDelta: number;
  /** True when the player didn't answer and the default applied. */
  readonly expired: boolean;
}

/** Profile builder signature used by the planner. */
export type ProfileFor = (kind: ActivityKind, atHome: boolean) => NeedProfile;
