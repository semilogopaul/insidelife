import {
  HABIT_ACTIONS,
  HABIT_EARLIEST_START,
  HABIT_LATEST_START,
  MINUTES_PER_HOUR,
  SKILL_LABELS,
  findAction,
  formatGameDuration,
  validateHabits,
  type Habit,
  type HabitActionId,
  type HabitDays,
  type SkillKey,
  type Skills,
} from '@insidelife/shared';

/** What each habit builds, in plain words. */
export const HABIT_BUILDS: Readonly<Record<HabitActionId, string>> = {
  study: 'Builds book sense (intellect)',
  'learn-code': 'Builds tech skill',
  'home-workout': 'Builds fitness',
  freelance: 'Builds tech and business — and pays',
  'watch-tv': 'Tops up fun',
  'play-games': 'Tops up fun',
};

const ITEM_LABELS: Readonly<Record<string, string>> = { laptop: 'a laptop', tv: 'a TV', console: 'a game console' };

export const DAY_LABELS: Readonly<Record<HabitDays, string>> = { daily: 'Every day', weekdays: 'Weekdays', weekends: 'Weekends' };

/** "8:00 PM" for a minute of the day. */
export function formatMinuteOfDay(minute: number): string {
  const hour = Math.floor(minute / MINUTES_PER_HOUR);
  const mins = minute % MINUTES_PER_HOUR;
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

/** Every allowed start time (05:00–22:00 in quarter hours). */
export const HABIT_START_OPTIONS: readonly number[] = Array.from({ length: (HABIT_LATEST_START - HABIT_EARLIEST_START) / 15 + 1 }, (_, index) => HABIT_EARLIEST_START + index * 15);

/** "Learn to code · 2h at 8:00 PM, weekdays" in words. */
export function describeHabit(habit: Habit): string {
  const action = findAction(habit.actionId);
  return `${action?.label ?? habit.actionId}, ${formatGameDuration(habit.durationMinutes)} at ${formatMinuteOfDay(habit.startMinute)}, ${DAY_LABELS[habit.days].toLowerCase()}`;
}

export interface HabitSubject {
  readonly age: number;
  readonly skills: Skills;
  /** Capability tags from your belongings (null while loading). */
  readonly itemTags: readonly string[] | null;
}

export interface UnmetHabitRequirement {
  readonly message: string;
  /** Next step: buy the item in the Shop app. */
  readonly fix: 'shop' | null;
}

/** First requirement you don't meet for a habit activity (same rules the server applies). */
export function unmetHabitRequirement(actionId: HabitActionId, subject: HabitSubject): UnmetHabitRequirement | null {
  const requires = findAction(actionId)?.requires;
  if (!requires) return null;
  if (requires.minAge !== undefined && subject.age < requires.minAge) return { message: `You must be ${requires.minAge}+`, fix: null };
  if (requires.itemTag && subject.itemTags !== null && !subject.itemTags.includes(requires.itemTag)) {
    return { message: `Needs ${ITEM_LABELS[requires.itemTag] ?? `a ${requires.itemTag}`}`, fix: 'shop' };
  }
  for (const [skill, minimum] of Object.entries(requires.minSkill ?? {}) as Array<[SkillKey, number]>) {
    if (subject.skills[skill] < minimum) return { message: `Needs ${SKILL_LABELS[skill].toLowerCase()} ${minimum} (you have ${Math.floor(subject.skills[skill])})`, fix: null };
  }
  return null;
}

/** A new habit for `actionId` at the first start time that doesn't clash with the others (evening first). */
export function draftHabit(actionId: HabitActionId, existing: readonly Habit[]): Habit {
  const durations = findAction(actionId)?.durations ?? [60];
  const durationMinutes = durations.includes(2 * MINUTES_PER_HOUR) ? 2 * MINUTES_PER_HOUR : (durations[0] ?? 60);
  const preferred = [20 * 60, 19 * 60, 18 * 60, 21 * 60, 7 * 60, 6 * 60, 22 * 60, ...HABIT_START_OPTIONS];
  for (const startMinute of preferred) {
    const habit: Habit = { actionId, startMinute, durationMinutes, days: 'daily' };
    if (validateHabits([...existing, habit]) === null) return habit;
  }
  return { actionId, startMinute: 20 * 60, durationMinutes, days: 'daily' };
}

export function habitsEqual(a: readonly Habit[], b: readonly Habit[]): boolean {
  return (
    a.length === b.length &&
    a.every((habit, index) => {
      const other = b[index];
      return other !== undefined && habit.actionId === other.actionId && habit.startMinute === other.startMinute && habit.durationMinutes === other.durationMinutes && habit.days === other.days;
    })
  );
}

export { HABIT_ACTIONS };
