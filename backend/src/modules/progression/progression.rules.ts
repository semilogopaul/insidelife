import {
  ACHIEVEMENTS,
  ACHIEVEMENT_RARITIES,
  DAILY_WELCOME_MAX_CASH,
  LIFE_CHAPTERS,
  LIFE_GOALS,
  MINUTES_PER_DAY,
  dailyWelcomeFlavourFor,
  findVenue,
  homeLocationId,
  isHomeLocation,
  rngFor,
  streetDistrict,
  type AchievementDefinition,
  type AchievementRarity,
  type BackgroundId,
  type DailyWelcomeFlavour,
  type DistrictId,
  type GameMinute,
  type GoalProgressDto,
  type LifeChapterDefinition,
  type LifeGoalDefinition,
  type LifeGoalStatus,
  type LifestyleTier,
  type ProgressionCondition,
  type ProgressUnit,
  type Skills,
} from '@insidelife/shared';
import type { CredentialsSnapshot } from '../../common/ports/credentials.port.js';
import type { EmploymentSnapshot } from '../../common/ports/employment.port.js';
import type { FamilySnapshot } from '../../common/ports/family.port.js';
import type { HomeSnapshot } from '../../common/ports/household.port.js';
import type { PowerBackup } from '../../common/ports/inventory.port.js';

/**
 * Pure progression rules: the condition evaluator, the chapter machine, presence/trip classification and the daily
 * welcome calendar. No I/O here — services gather facts and persist outcomes.
 */

// ----- Facts -------------------------------------------------------------------------------------------------------

/** Where a condition leaf gets its data. `counters` and `character` are free; the rest cost a domain lookup. */
export const FACT_SOURCES = [
  'counters',
  'character',
  'credentials',
  'employment',
  'tags',
  'home',
  'property',
  'family',
  'savings',
  'power',
  'health',
] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

/** Sources that need no port call (safe to evaluate on every API refresh). */
export const CHEAP_SOURCES: ReadonlySet<FactSource> = new Set<FactSource>(['counters', 'character']);

export interface CharacterFacts {
  readonly status: number;
  readonly background: BackgroundId;
  readonly age: number;
  readonly generation: number;
  readonly skills: Skills;
  readonly fitness: number;
  readonly lifestyle: LifestyleTier;
  readonly earnedTotal: number;
}

/** Everything conditions can look at. Optional fields are only present when that source was gathered. */
export interface ProgressionFacts {
  readonly counters: ReadonlyMap<string, number>;
  readonly character: CharacterFacts;
  readonly credentials?: CredentialsSnapshot;
  readonly employment?: EmploymentSnapshot | null;
  readonly tags?: ReadonlySet<string>;
  readonly home?: HomeSnapshot;
  readonly propertyValue?: number;
  readonly family?: FamilySnapshot;
  readonly savings?: number;
  readonly power?: PowerBackup;
  /** Tracked illnesses the character currently has. */
  readonly illnesses?: ReadonlySet<string>;
}

export interface ConditionResult {
  readonly met: boolean;
  readonly current: number;
  readonly target: number;
  readonly unit: ProgressUnit;
}

const step = (met: boolean): ConditionResult => ({ met, current: met ? 1 : 0, target: 1, unit: 'step' });
const measure = (value: number, atLeast: number, unit: ProgressUnit): ConditionResult => {
  const target = Math.max(1, atLeast);
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return { met: safe >= atLeast, current: Math.min(Math.floor(safe), target), target, unit };
};
const ratio = (result: ConditionResult): number => (result.target > 0 ? result.current / result.target : result.met ? 1 : 0);

/** Evaluate a condition. Missing facts (source not gathered) never satisfy a leaf. */
export function evaluateCondition(condition: ProgressionCondition, facts: ProgressionFacts): ConditionResult {
  const character = facts.character;
  switch (condition.kind) {
    case 'always':
      return step(true);
    case 'counter':
      return measure(facts.counters.get(condition.key) ?? 0, condition.atLeast, condition.key.startsWith('signal-total:') ? 'naira' : 'count');
    case 'status':
      return measure(character.status, condition.atLeast, 'points');
    case 'skill':
      return measure(character.skills[condition.skill], condition.atLeast, 'points');
    case 'fitness':
      return measure(character.fitness, condition.atLeast, 'points');
    case 'age':
      return measure(character.age, condition.atLeast, 'years');
    case 'generation':
      return measure(character.generation, condition.atLeast, 'count');
    case 'background':
      return step(condition.in.includes(character.background));
    case 'lifestyle':
      return step(condition.in.includes(character.lifestyle));
    case 'earned':
      return measure(character.earnedTotal, condition.atLeast, 'naira');
    case 'item-tag':
      return step(facts.tags?.has(condition.tag) ?? false);
    case 'power-backup':
      return step(facts.power !== undefined && facts.power !== 'none');
    case 'jamb-registered':
      return step(facts.credentials !== undefined && (facts.credentials.jambRegistered === true || isNumber(facts.credentials.jambScore)));
    case 'jamb-written':
      return step(isNumber(facts.credentials?.jambScore));
    case 'jamb-score': {
      const score = facts.credentials?.jambScore;
      return isNumber(score) ? measure(score, condition.atLeast, 'score') : { met: false, current: 0, target: condition.atLeast, unit: 'score' };
    }
    case 'admitted':
      return step(facts.credentials !== undefined && (facts.credentials.admitted === true || facts.credentials.enrolled));
    case 'degree': {
      const grades = condition.grades;
      return step(facts.credentials?.degrees.some((degree) => !grades || grades.includes(degree.grade)) ?? false);
    }
    case 'certification':
      return step(facts.credentials?.certifications.some((code) => condition.anyOf.includes(code)) ?? false);
    case 'nysc-completed':
      return step(facts.credentials?.nysc === 'completed');
    case 'employed':
      return step(facts.employment !== undefined && facts.employment !== null);
    case 'monthly-pay':
      return measure(facts.employment?.monthlyPayNaira ?? 0, condition.atLeast, 'naira');
    case 'home': {
      const home = facts.home;
      const districts = condition.districts;
      return step(home !== undefined && condition.ownership.includes(home.ownership) && (!districts || districts.includes(home.districtId)));
    }
    case 'property-value':
      return measure(facts.propertyValue ?? 0, condition.atLeast, 'naira');
    case 'relationship':
      return step(facts.family !== undefined && condition.in.includes(facts.family.relationship));
    case 'children': {
      const minAge = condition.minAge ?? 0;
      const eligible = facts.family?.children.filter((child) => child.alive && child.age >= minAge).length ?? 0;
      return measure(eligible, condition.atLeast, 'count');
    }
    case 'savings':
      return measure(facts.savings ?? 0, condition.atLeast, 'naira');
    case 'not-ill':
      return step(facts.illnesses !== undefined && !facts.illnesses.has(condition.conditionId));
    case 'all': {
      const results = condition.of.map((child) => evaluateCondition(child, facts));
      const weakest = results.reduce<ConditionResult | null>((worst, result) => (!worst || ratio(result) < ratio(worst) ? result : worst), null);
      return { ...(weakest ?? step(true)), met: results.every((result) => result.met) };
    }
    case 'any': {
      const results = condition.of.map((child) => evaluateCondition(child, facts));
      const best = results.reduce<ConditionResult | null>((top, result) => (!top || ratio(result) > ratio(top) ? result : top), null);
      return { ...(best ?? step(false)), met: results.some((result) => result.met) };
    }
  }
}

const isNumber = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

/** Progress for the client: null when there's nothing meaningful to show. */
export function progressOf(result: ConditionResult): GoalProgressDto | null {
  if (result.met) return null;
  return { current: result.current, target: result.target, unit: result.unit };
}

/** Which sources a condition reads. */
export function sourcesOf(condition: ProgressionCondition, into: Set<FactSource> = new Set()): Set<FactSource> {
  switch (condition.kind) {
    case 'always':
      break;
    case 'counter':
      into.add('counters');
      break;
    case 'status':
    case 'skill':
    case 'fitness':
    case 'age':
    case 'generation':
    case 'background':
    case 'lifestyle':
    case 'earned':
      into.add('character');
      break;
    case 'item-tag':
      into.add('tags');
      break;
    case 'power-backup':
      into.add('power');
      break;
    case 'jamb-registered':
    case 'jamb-written':
    case 'jamb-score':
    case 'admitted':
    case 'degree':
    case 'certification':
    case 'nysc-completed':
      into.add('credentials');
      break;
    case 'employed':
    case 'monthly-pay':
      into.add('employment');
      break;
    case 'home':
      into.add('home');
      break;
    case 'property-value':
      into.add('property');
      break;
    case 'relationship':
    case 'children':
      into.add('family');
      break;
    case 'savings':
      into.add('savings');
      break;
    case 'not-ill':
      into.add('health');
      break;
    case 'all':
    case 'any':
      for (const child of condition.of) sourcesOf(child, into);
      break;
  }
  return into;
}

/** Counter keys a condition reads (used to re-evaluate only what a counter change can affect). */
export function counterKeysOf(condition: ProgressionCondition, into: Set<string> = new Set()): Set<string> {
  if (condition.kind === 'counter') into.add(condition.key);
  if (condition.kind === 'all' || condition.kind === 'any') for (const child of condition.of) counterKeysOf(child, into);
  return into;
}

/** Illness ids referenced by `not-ill` leaves (the only ones worth asking the health port about). */
export function illnessesOf(condition: ProgressionCondition, into: Set<string> = new Set()): Set<string> {
  if (condition.kind === 'not-ill') into.add(condition.conditionId);
  if (condition.kind === 'all' || condition.kind === 'any') for (const child of condition.of) illnessesOf(child, into);
  return into;
}

// ----- Catalog index -----------------------------------------------------------------------------------------------

export interface IndexedCondition {
  readonly sources: ReadonlySet<FactSource>;
  readonly counterKeys: ReadonlySet<string>;
}

const indexCondition = (condition: ProgressionCondition): IndexedCondition => ({
  sources: sourcesOf(condition),
  counterKeys: counterKeysOf(condition),
});

/** Catalogs widened to their interfaces (optional fields readable on every entry). */
const GOALS: readonly LifeGoalDefinition[] = LIFE_GOALS;
const BADGES: readonly AchievementDefinition[] = ACHIEVEMENTS;

/** Precomputed per catalog entry so hooks can pick candidates without walking condition trees. */
export const GOAL_CONDITION_INDEX: ReadonlyMap<string, IndexedCondition> = new Map(
  GOALS.map((goal) => {
    const parts: ProgressionCondition[] = [goal.condition];
    if (goal.bonus) parts.push(goal.bonus.condition);
    return [goal.id, indexCondition({ kind: 'all', of: parts })];
  }),
);

export const ACHIEVEMENT_CONDITION_INDEX: ReadonlyMap<string, IndexedCondition> = new Map(
  BADGES.map((achievement) => [achievement.id, indexCondition(achievement.condition)]),
);

/** Illnesses any achievement tracks (malaria, typhoid…). */
export const TRACKED_ILLNESSES: readonly string[] = [
  ...new Set(BADGES.flatMap((achievement) => [...illnessesOf(achievement.condition)])),
].toSorted();

/** What can make an item worth re-evaluating. */
export type EvaluationTrigger =
  | { readonly kind: 'counters'; readonly keys: ReadonlySet<string> }
  | { readonly kind: 'day-end' }
  | { readonly kind: 'refresh' }
  | { readonly kind: 'activated'; readonly goalIds: ReadonlySet<string> };

/** Should this goal be checked for this trigger? */
export function goalMatchesTrigger(goalId: string, trigger: EvaluationTrigger): boolean {
  const index = GOAL_CONDITION_INDEX.get(goalId);
  if (!index) return false;
  switch (trigger.kind) {
    case 'counters':
      return intersects(index.counterKeys, trigger.keys);
    case 'activated':
      return trigger.goalIds.has(goalId);
    case 'day-end':
    case 'refresh':
      return true;
  }
}

/** Should this achievement be checked for this trigger? Refreshes only look at cheap conditions. */
export function achievementMatchesTrigger(achievementId: string, trigger: EvaluationTrigger): boolean {
  const index = ACHIEVEMENT_CONDITION_INDEX.get(achievementId);
  if (!index) return false;
  switch (trigger.kind) {
    case 'counters':
      return intersects(index.counterKeys, trigger.keys);
    case 'activated':
      return false;
    case 'day-end':
      return true;
    case 'refresh':
      return [...index.sources].every((source) => CHEAP_SOURCES.has(source));
  }
}

const intersects = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => {
  for (const key of a) if (b.has(key)) return true;
  return false;
};

// ----- Chapters ----------------------------------------------------------------------------------------------------

export interface ChapterState {
  /** First chapter whose required goals are not all complete (the last chapter once everything is done). */
  readonly current: number;
  readonly legacyComplete: boolean;
}

export function chapterState(
  completed: ReadonlySet<string>,
  goals: readonly LifeGoalDefinition[] = GOALS,
  chapters: readonly LifeChapterDefinition[] = LIFE_CHAPTERS,
): ChapterState {
  const ordered = chapters.toSorted((a, b) => a.number - b.number);
  for (const chapter of ordered) {
    const blocking = goals.some((goal) => goal.chapter === chapter.number && !goal.optional && !completed.has(goal.id));
    if (blocking) return { current: chapter.number, legacyComplete: false };
  }
  return { current: ordered[ordered.length - 1]?.number ?? 1, legacyComplete: true };
}

export function goalStatusFor(goal: LifeGoalDefinition, completed: ReadonlySet<string>, currentChapter: number): LifeGoalStatus {
  if (completed.has(goal.id)) return 'completed';
  if (goal.chapter > currentChapter) return 'locked';
  if ((goal.after ?? []).some((id) => !completed.has(id))) return 'locked';
  return 'active';
}

/** The path that satisfied a branching goal (first one in catalog order). */
export function satisfiedPathId(goal: LifeGoalDefinition, facts: ProgressionFacts): string | null {
  for (const path of goal.paths ?? []) if (evaluateCondition(path.condition, facts).met) return path.id;
  return null;
}

// ----- Clout -------------------------------------------------------------------------------------------------------

export function achievementClout(rarity: AchievementRarity): number {
  return ACHIEVEMENT_RARITIES[rarity].clout;
}

/** Add clout under a cap; returns the new total and how much was actually granted. */
export function addCappedClout(current: number, amount: number, cap: number): { readonly total: number; readonly granted: number } {
  const total = Math.min(cap, Math.max(current, current + Math.max(0, Math.round(amount))));
  return { total, granted: total - current };
}

export function rarityPercent(unlocks: number, population: number): number {
  if (population <= 0 || unlocks <= 0) return 0;
  return Math.round(Math.min(100, (unlocks * 100) / population) * 10) / 10;
}

export function secretMasked(achievement: AchievementDefinition, unlocked: boolean): boolean {
  return achievement.secret === true && !unlocked;
}

// ----- Presence & trips --------------------------------------------------------------------------------------------

/** Late-night window for the "Night crawler" flag (02:00-04:00). */
export const STREET_LATE_WINDOW: readonly [number, number] = [2 * 60, 4 * 60];
/** Third Mainland "sunset" window (18:00-19:00). */
export const SUNSET_WINDOW: readonly [number, number] = [18 * 60, 19 * 60];
/** A trip this long (game minutes) within Lagos counts as a go-slow survival. */
export const LONG_TRIP_MINUTES = 120;

/** True if [start, end) overlaps the daily window [from, to) (minutes of day) on any day it spans. */
export function overlapsDailyWindow(start: GameMinute, end: GameMinute, window: readonly [number, number]): boolean {
  if (end <= start) return false;
  const [from, to] = window;
  const firstDay = Math.floor(start / MINUTES_PER_DAY);
  const lastDay = Math.min(Math.floor((end - 1) / MINUTES_PER_DAY), firstDay + 7);
  for (let day = firstDay; day <= lastDay; day++) {
    const windowStart = day * MINUTES_PER_DAY + from;
    const windowEnd = day * MINUTES_PER_DAY + to;
    if (start < windowEnd && end > windowStart) return true;
  }
  return false;
}

export interface PlaceFacts {
  /** Lagos district, or null out of town / at someone else's house. */
  readonly districtId: DistrictId | null;
  /** Out-of-town region, when not in Lagos. */
  readonly regionId: string | null;
  readonly venueId: string | null;
  readonly street: boolean;
}

/** Classify a location id for presence counters. */
export function placeOf(locationId: string, characterId: string, homeDistrictId: DistrictId): PlaceFacts {
  const street = streetDistrict(locationId);
  if (street) return { districtId: street, regionId: null, venueId: null, street: true };
  if (isHomeLocation(locationId)) {
    return { districtId: locationId === homeLocationId(characterId) ? homeDistrictId : null, regionId: null, venueId: null, street: false };
  }
  const venue = findVenue(locationId);
  if (!venue) return { districtId: null, regionId: null, venueId: null, street: false };
  const outOfTown = venue.regionId !== undefined && venue.regionId !== 'lagos';
  return {
    districtId: outOfTown ? null : venue.districtId,
    regionId: outOfTown ? (venue.regionId ?? null) : null,
    venueId: venue.id,
    street: false,
  };
}

/** Flags a presence at `place` sets (first visits, "stepped outside"). */
export function presenceFlags(place: PlaceFacts): string[] {
  const flags: string[] = [];
  if (place.street) flags.push('outside');
  if (place.venueId) flags.push(`venue:${place.venueId}`);
  if (place.districtId) flags.push(`district:${place.districtId}`);
  if (place.regionId) flags.push(`region:${place.regionId}`);
  return flags;
}

/** Distinct-count counters derived from newly set flags (a first visit bumps `venues` and `venue-type:<type>`). */
export function aggregateDeltasForFlags(newFlags: readonly string[]): Map<string, number> {
  const deltas = new Map<string, number>();
  const bump = (key: string): void => {
    deltas.set(key, (deltas.get(key) ?? 0) + 1);
  };
  for (const flag of newFlags) {
    if (flag.startsWith('venue:')) {
      const venue = findVenue(flag.slice('venue:'.length));
      bump('venues');
      if (venue) bump(`venue-type:${venue.type}`);
    } else if (flag.startsWith('district:')) {
      bump('districts');
    } else if (flag.startsWith('region:')) {
      bump('regions');
    }
  }
  return deltas;
}

// ----- Promotions --------------------------------------------------------------------------------------------------

export function jobKeyOf(job: Pick<EmploymentSnapshot, 'jobId' | 'title'> | null): string | null {
  return job ? `${job.jobId}|${job.title}` : null;
}

/** Same job, new title → promotion. A different job is a move, not a promotion. */
export function isPromotion(previousKey: string | null, job: Pick<EmploymentSnapshot, 'jobId' | 'title'> | null): boolean {
  if (!previousKey || !job) return false;
  const separator = previousKey.indexOf('|');
  if (separator < 0) return false;
  return previousKey.slice(0, separator) === job.jobId && previousKey.slice(separator + 1) !== job.title;
}

// ----- Probe cadence -----------------------------------------------------------------------------------------------

/** Days near "now" are always probed; long offline catch-ups probe once a week. */
export const PROBE_RECENT_MINUTES = 2 * MINUTES_PER_DAY;
export const PROBE_CATCH_UP_STRIDE = 7;

export function shouldProbeDay(dayIndex: number, lastProbedDay: number | null, now: GameMinute): boolean {
  if (lastProbedDay === null) return true;
  if (dayIndex <= lastProbedDay) return false;
  const dayEndsAt = (dayIndex + 1) * MINUTES_PER_DAY;
  if (now - dayEndsAt < PROBE_RECENT_MINUTES) return true;
  return dayIndex - lastProbedDay >= PROBE_CATCH_UP_STRIDE;
}

/** How many game days one probe stands for (for tallies like strike days). */
export function probeWeight(dayIndex: number, lastProbedDay: number | null): number {
  if (lastProbedDay === null) return 1;
  return Math.max(1, Math.min(PROBE_CATCH_UP_STRIDE, dayIndex - lastProbedDay));
}

// ----- Daily welcome (real Africa/Lagos calendar) ------------------------------------------------------------------

export const LAGOS_TIME_ZONE = 'Africa/Lagos';

const lagosFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: LAGOS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

const WEEKDAY_INDEX: Readonly<Record<string, number>> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface LagosDay {
  /** YYYY-MM-DD in Africa/Lagos. */
  readonly date: string;
  /** 0 = Sunday … 6 = Saturday. */
  readonly weekday: number;
}

interface LagosWallClock extends LagosDay {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

function lagosWallClock(ms: number): LagosWallClock {
  const parts = new Map(lagosFormatter.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  const year = Number(parts.get('year'));
  const month = Number(parts.get('month'));
  const day = Number(parts.get('day'));
  const hour = Number(parts.get('hour')) % 24;
  const minute = Number(parts.get('minute'));
  const weekday = WEEKDAY_INDEX[parts.get('weekday') ?? ''] ?? 0;
  const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, hour, minute, weekday, date };
}

/** The Lagos calendar day at a real instant. */
export function lagosDay(ms: number): LagosDay {
  const { date, weekday } = lagosWallClock(ms);
  return { date, weekday };
}

/** Real epoch ms of the next Lagos midnight after `ms`. */
export function nextLagosMidnight(ms: number): number {
  const wall = lagosWallClock(ms);
  const wholeMinute = ms - (((ms % 60_000) + 60_000) % 60_000);
  const offset = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) - wholeMinute;
  return Date.UTC(wall.year, wall.month - 1, wall.day + 1) - offset;
}

export interface DailyWelcomeGift {
  readonly flavour: DailyWelcomeFlavour;
  readonly cash: number;
}

/** Deterministic per character and Lagos date (re-requests can never re-roll), always ≤ DAILY_WELCOME_MAX_CASH. */
export function dailyWelcomeGift(seed: string, day: LagosDay): DailyWelcomeGift {
  const flavour = dailyWelcomeFlavourFor(day.weekday);
  const raw = rngFor(seed, 'daily-welcome', day.date).int(flavour.minCash, flavour.maxCash);
  const cash = Math.min(DAILY_WELCOME_MAX_CASH, Math.max(0, Math.round(raw / 500) * 500));
  return { flavour, cash };
}

// ----- Milestone copy ----------------------------------------------------------------------------------------------

export function renderMomentText(template: string, values: { readonly name: string; readonly detail: string }): string {
  return template.replaceAll('{name}', values.name).replaceAll('{detail}', values.detail);
}
