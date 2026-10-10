import { describe, expect, it } from 'vitest';
import { SKILL_KEYS, type Skills } from '@insidelife/shared';
import { HABIT_START_OPTIONS, describeHabit, draftHabit, formatMinuteOfDay, habitsEqual, unmetHabitRequirement } from '../services/habits';

const skills = (patch: Partial<Skills> = {}): Skills => ({ ...(Object.fromEntries(SKILL_KEYS.map((key) => [key, 0])) as Skills), ...patch });

describe('habits', () => {
  it('formats times and descriptions', () => {
    expect(formatMinuteOfDay(20 * 60)).toBe('8:00 PM');
    expect(formatMinuteOfDay(5 * 60 + 30)).toBe('5:30 AM');
    expect(formatMinuteOfDay(12 * 60 + 15)).toBe('12:15 PM');
    expect(describeHabit({ actionId: 'learn-code', startMinute: 20 * 60, durationMinutes: 60, days: 'weekdays' })).toBe('Learn to code, 1h at 8:00 PM, weekdays');
    expect(HABIT_START_OPTIONS[0]).toBe(300);
    expect(HABIT_START_OPTIONS.at(-1)).toBe(1320);
  });

  it('explains unmet requirements with the next step', () => {
    expect(unmetHabitRequirement('learn-code', { age: 20, skills: skills(), itemTags: [] })).toEqual({ message: 'Needs a laptop', fix: 'shop' });
    expect(unmetHabitRequirement('freelance', { age: 20, skills: skills({ tech: 12 }), itemTags: ['laptop'] })).toEqual({ message: 'Needs tech 20 (you have 12)', fix: null });
    expect(unmetHabitRequirement('study', { age: 17, skills: skills(), itemTags: [] })).toBeNull();
    expect(unmetHabitRequirement('learn-code', { age: 20, skills: skills(), itemTags: null })).toBeNull();
  });

  it('drafts a new habit that never overlaps the existing one', () => {
    const first = draftHabit('study', []);
    expect(first).toEqual({ actionId: 'study', startMinute: 1200, durationMinutes: 60, days: 'daily' });
    const second = draftHabit('home-workout', [first]);
    expect(second.durationMinutes).toBe(25);
    expect(second.startMinute + second.durationMinutes <= first.startMinute || second.startMinute >= first.startMinute + first.durationMinutes).toBe(true);
  });

  it('compares habit lists by value', () => {
    const habit = draftHabit('study', []);
    expect(habitsEqual([habit], [{ ...habit }])).toBe(true);
    expect(habitsEqual([habit], [{ ...habit, days: 'weekends' }])).toBe(false);
  });
});
