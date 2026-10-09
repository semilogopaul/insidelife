import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import type {
  Appearance,
  BackgroundId,
  DistrictId,
  Gender,
  Habit,
  LifestyleTier,
  Needs,
  Outfit,
  RegionId,
  Skills,
  TransportMode,
} from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** An explicit, player-chosen action in progress. */
export interface ActivityState {
  readonly actionId: string;
  readonly startedAt: number;
  readonly endsAt: number;
  readonly locationId: string;
  readonly targetId?: string;
  readonly cost: number;
}

/** This week's habit sessions, summarised in a weekly digest notification. */
export interface HabitLog {
  readonly weekStartDay: number;
  /** Minutes completed per habit action. */
  readonly minutes: Readonly<Record<string, number>>;
  /** Skills when the week began (to show growth). */
  readonly skillsAtStart: Skills;
}

/** A trip in progress within Lagos (or to an out-of-town region). */
export interface TravelState {
  readonly fromLocationId: string;
  readonly toLocationId: string;
  readonly mode: TransportMode;
  readonly departAt: number;
  readonly arriveAt: number;
  readonly fare: number;
  /** Booked by the player (true) or started by the routine autopilot (false/absent). */
  readonly explicit?: boolean;
  /** `open-world`: the player walked/drove themselves (mileage and fuel were already charged on the way). */
  readonly source?: 'open-world';
}

/** Temporary mood modifiers ("Just got paid", "Heartbroken"). */
export interface MoodModifier {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly until: number;
}

@Entity('characters')
@Index('characters_one_living_per_user', ['userId'], { unique: true, where: '"alive" = true' })
@Index('characters_settle_queue', ['alive', 'settledAt'])
@Index('characters_location_alive', ['locationId'], { where: '"alive" = true' })
@Index('characters_status_alive', ['status'], { where: '"alive" = true' })
export class CharacterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  /** Public @handle, lower-case. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  handle: string;

  @Column({ type: 'varchar', length: 40 })
  firstName: string;

  @Column({ type: 'varchar', length: 40 })
  lastName: string;

  @Column({ type: 'varchar', length: 8 })
  gender: Gender;

  @Column({ type: 'varchar', length: 24 })
  stateOfOrigin: string;

  @Column({ type: 'varchar', length: 24 })
  background: BackgroundId;

  @Column({ type: 'jsonb' })
  appearance: Appearance;

  @Column({ type: 'jsonb', default: {} })
  outfit: Outfit;

  /** Game minute of birth. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  bornAt: number;

  @Column({ type: 'boolean', default: true })
  alive: boolean;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  diedAt: number | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  causeOfDeath: string | null;

  /** 1 for a founder; heirs increment. */
  @Column({ type: 'int', default: 1 })
  generation: number;

  /** Shared by a founder and all their heirs. */
  @Index()
  @Column({ type: 'uuid' })
  dynastyId: string;

  @Column({ type: 'uuid', nullable: true })
  predecessorId: string | null;

  @Column({ type: 'varchar', length: 16 })
  lifestyle: LifestyleTier;

  @Column({ type: 'varchar', length: 8, default: 'danfo' })
  defaultTransport: TransportMode;

  /** Needs as of `settledAt`. */
  @Column({ type: 'jsonb' })
  needs: Needs;

  @Column({ type: 'real', default: 80 })
  health: number;

  @Column({ type: 'real', default: 40 })
  fitness: number;

  @Column({ type: 'jsonb' })
  skills: Skills;

  @Column({ type: 'jsonb', default: [] })
  moodModifiers: MoodModifier[];

  /** Clout 0-1000. */
  @Column({ type: 'int', default: 0 })
  status: number;

  /** Home-cooked meals in the kitchen (groceries add them, Cook uses one; see PANTRY_MAX_MEALS). */
  @Column({ type: 'int', default: 0 })
  pantryMeals: number;

  /** "Man know man": network strength 0-100, boosts applications and deals. */
  @Column({ type: 'real', default: 5 })
  connections: number;

  /** Venue id or `home:<characterId>`. */
  @Column({ type: 'varchar', length: 64 })
  locationId: string;

  @Column({ type: 'varchar', length: 16, default: 'lagos' })
  regionId: RegionId;

  @Column({ type: 'varchar', length: 24 })
  homeDistrictId: DistrictId;

  /** The owned property (land or building) the player lives in, so the city shows their own house. */
  @Column({ type: 'uuid', nullable: true })
  homePropertyId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  activity: ActivityState | null;

  @Column({ type: 'jsonb', nullable: true })
  travel: TravelState | null;

  /** Daily habits the autopilot keeps (see `@insidelife/shared` habits). */
  @Column({ type: 'jsonb', default: [] })
  habits: Habit[];

  /** A habit session the player cancelled isn't restarted before this game minute. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  habitsPausedUntil: number | null;

  @Column({ type: 'jsonb', nullable: true })
  habitLog: HabitLog | null;

  /** Game minute up to which the simulation has been applied. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  settledAt: number;

  /** Seed for this character's deterministic rolls. */
  @Column({ type: 'varchar', length: 32 })
  seed: string;

  /** Income the player earned (salary, business, investments…) — powers the self-made rich list. */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  earnedTotal: number;

  /** Money that arrived without being earned: starting cash, allowance, gifts, inheritance, top-ups. */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  unearnedTotal: number;

  /**
   * Unearned value that can never be sent to other players: starting money (family money + starter fund) and the value
   * of free assets. Spendable in the game; see `peerSendable`.
   */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  lockedUnearned: number;

  /** Real-money top-ups (subset of unearned). */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  purchasedTotal: number;

  /** Cached net worth for leaderboards (refreshed on settle). */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  netWorth: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastActiveAt: Date;

  /**
   * Set while the owner's account is deleted (soft delete): other players can't find, message, visit, pay or rank
   * this character. The simulation keeps running like any offline player's, so a restored account picks up normally.
   */
  @Column({ type: 'timestamptz', nullable: true })
  hiddenAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @VersionColumn()
  version: number;
}
