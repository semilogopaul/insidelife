import { CHILD_SCHOOLS, DAYS_PER_YEAR, createRng } from '@insidelife/shared';
import { attendsSchool, driftPerformance, isTermStartDay, nextTermStartDay, termFee, termIndexOfDay, termStartDay, waecCredits } from './school.rules.js';

const averageCredits = (performance: number): number =>
  Array.from({ length: 200 }, (_, i) => waecCredits(performance, createRng(`avg:${performance}:${i}`))).reduce((a, b) => a + b, 0) / 200;

describe('school fee schedule', () => {
  it('starts three terms a year: January, May and September', () => {
    const starts = Array.from({ length: DAYS_PER_YEAR * 2 }, (_, day) => day).filter(isTermStartDay);
    expect(starts).toEqual([0, 120, 240, 360, 480, 600]);
  });

  it('indexes terms continuously and round-trips term starts', () => {
    expect(termIndexOfDay(0)).toBe(0);
    expect(termIndexOfDay(119)).toBe(0);
    expect(termIndexOfDay(120)).toBe(1);
    expect(termIndexOfDay(359)).toBe(2);
    expect(termIndexOfDay(360)).toBe(3);
    for (let term = 0; term < 30; term++) expect(termIndexOfDay(termStartDay(term))).toBe(term);
    expect(nextTermStartDay(10)).toBe(120);
    expect(nextTermStartDay(240)).toBe(360);
  });

  it('charges school from 3 to 17 only', () => {
    expect(attendsSchool(2)).toBe(false);
    expect(attendsSchool(3)).toBe(true);
    expect(attendsSchool(17)).toBe(true);
    expect(attendsSchool(18)).toBe(false);
  });

  it('prices terms by tier with the world price index, rounded to ₦500', () => {
    expect(termFee('none', 1.2)).toBe(0);
    expect(termFee('public', 1)).toBe(CHILD_SCHOOLS.public.feePerTerm);
    expect(termFee('mid-private', 1)).toBe(300_000);
    expect(termFee('mid-private', 1.13)).toBe(339_000);
    expect(termFee('elite', 1) * 3).toBeGreaterThanOrEqual(2_500_000);
    for (const tier of ['public', 'mid-private', 'elite', 'international'] as const) {
      expect(termFee(tier, 1.0371) % 500).toBe(0);
    }
  });

  it('moves performance toward the tier and penalises being sent home', () => {
    const paid = driftPerformance(0.5, 'elite', false);
    const sentHome = driftPerformance(0.5, 'elite', true);
    expect(paid).toBeGreaterThan(0.5);
    expect(sentHome).toBeLessThan(paid);
  });

  it('gives deterministic WAEC credits out of 9 that reward good schools', () => {
    for (let i = 0; i < 100; i++) {
      const credits = waecCredits(i / 100, createRng(`waec:${i}`));
      expect(credits).toBeGreaterThanOrEqual(0);
      expect(credits).toBeLessThanOrEqual(9);
      expect(waecCredits(i / 100, createRng(`waec:${i}`))).toBe(credits);
    }
    expect(averageCredits(0.88)).toBeGreaterThan(averageCredits(0.45));
  });
});
