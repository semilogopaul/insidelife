import { describe, expect, it } from 'vitest';
import { habitRunsOn, validateHabits, type Habit } from './habits.js';

const code: Habit = { actionId: 'learn-code', startMinute: 20 * 60, durationMinutes: 60, days: 'weekdays' };

describe('habits', () => {
  it('accepts a sensible routine', () => {
    expect(validateHabits([code, { actionId: 'home-workout', startMinute: 6 * 60, durationMinutes: 25, days: 'daily' }])).toBeNull();
  });

  it('rejects overlaps, odd times, bad durations and too many habits', () => {
    expect(validateHabits([code, { ...code, actionId: 'study', startMinute: 20 * 60 + 30 }])).toMatch(/overlap/);
    expect(validateHabits([code, { ...code, actionId: 'study', startMinute: 21 * 60 }])).toBeNull();
    expect(validateHabits([{ ...code, startMinute: 20 * 60 + 7 }])).toMatch(/quarter hour/);
    expect(validateHabits([{ ...code, startMinute: 23 * 60 }])).toMatch(/between/);
    expect(validateHabits([{ ...code, durationMinutes: 50 }])).toMatch(/session lengths/);
    expect(validateHabits([{ ...code, durationMinutes: 120 }])).toMatch(/session lengths/);
    expect(validateHabits([code, { ...code, days: 'weekends' }, { ...code, startMinute: 6 * 60, days: 'daily' }])).toMatch(/up to 2/);
    expect(validateHabits([{ ...code, actionId: 'sleep' as Habit['actionId'] }])).toMatch(/can’t be a habit/);
  });

  it('lets weekday and weekend habits share a time slot', () => {
    expect(validateHabits([code, { ...code, actionId: 'watch-tv', days: 'weekends' }])).toBeNull();
    expect(habitRunsOn(code, 0)).toBe(true);
    expect(habitRunsOn(code, 6)).toBe(false);
    expect(habitRunsOn({ ...code, days: 'weekends' }, 5)).toBe(true);
  });
});
