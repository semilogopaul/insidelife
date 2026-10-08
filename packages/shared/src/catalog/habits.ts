import { MINUTES_PER_HOUR } from '../time/calendar.js';
import { findAction } from './actions.js';

/**
 * Daily habits: a player schedules a free home activity ("learn to code, 2h at 8pm on weekdays") and the autopilot
 * does it while they're away — at home, awake and with energy to spare. Most game days pass offline (a real hour is
 * five game days), so habits are how steady self-improvement happens without grinding.
 */
export const HABIT_ACTIONS = ['study', 'learn-code', 'home-workout', 'freelance', 'watch-tv', 'play-games'] as const;
export type HabitActionId = (typeof HABIT_ACTIONS)[number];

export const HABIT_DAYS = ['daily', 'weekdays', 'weekends'] as const;
export type HabitDays = (typeof HABIT_DAYS)[number];

export interface Habit {
  readonly actionId: HabitActionId;
  /** Minute of the day the habit starts (05:00–22:00, quarter-hour steps). */
  readonly startMinute: number;
  /** One of the action's allowed durations. */
  readonly durationMinutes: number;
  readonly days: HabitDays;
}

export const MAX_HABITS = 2;
export const HABIT_EARLIEST_START = 5 * MINUTES_PER_HOUR;
export const HABIT_LATEST_START = 22 * MINUTES_PER_HOUR;
/** Below this energy the autopilot rests instead (it never trades sleep or health for a habit). */
export const HABIT_MIN_ENERGY = 25;

export function isHabitAction(actionId: string): actionId is HabitActionId {
  return (HABIT_ACTIONS as readonly string[]).includes(actionId);
}

/** Whether a habit runs on a weekday index (0 = Monday … 6 = Sunday, as in `toDateParts`). */
export function habitRunsOn(habit: Habit, weekday: number): boolean {
  if (habit.days === 'daily') return true;
  const weekend = weekday >= 5;
  return habit.days === 'weekends' ? weekend : !weekend;
}

/** First problem with a set of habits, or null when they're valid. */
export function validateHabits(habits: readonly Habit[]): string | null {
  if (habits.length > MAX_HABITS) return `You can keep up to ${MAX_HABITS} habits`;
  for (const habit of habits) {
    const action = findAction(habit.actionId);
    if (!action || !isHabitAction(habit.actionId)) return 'That activity can’t be a habit';
    if (!action.durations.includes(habit.durationMinutes)) return `${action.label}: pick one of the usual session lengths`;
    if (habit.startMinute < HABIT_EARLIEST_START || habit.startMinute > HABIT_LATEST_START || habit.startMinute % 15 !== 0) {
      return 'Habits start between 5am and 10pm, on the quarter hour';
    }
  }
  for (let i = 0; i < habits.length; i++) {
    for (let j = i + 1; j < habits.length; j++) {
      const a = habits[i]!;
      const b = habits[j]!;
      const sameDays = a.days === b.days || a.days === 'daily' || b.days === 'daily';
      const overlap = a.startMinute < b.startMinute + b.durationMinutes && b.startMinute < a.startMinute + a.durationMinutes;
      if (sameDays && overlap) return 'Two habits overlap — move one of them';
    }
  }
  return null;
}
