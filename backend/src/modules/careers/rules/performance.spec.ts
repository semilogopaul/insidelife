import { MINUTES_PER_DAY, findJob } from '@insidelife/shared';
import { applyAttendanceDiscipline, dayPerformance, rollPerformance, skillFit, type StrikeState } from './performance.js';
import { skills } from './fixtures-spec.js';

describe('performance and discipline', () => {
  it('rewards full attendance and good mood', () => {
    expect(dayPerformance(1, 1.25, 1)).toBeCloseTo(1, 5);
    expect(dayPerformance(0, 0.6, 0)).toBe(0);
    expect(rollPerformance(0.5, 1)).toBeGreaterThan(0.5);
    expect(rollPerformance(0.9, 0)).toBeLessThan(0.9);
  });

  it('measures skill fit against the current level', () => {
    const swe = findJob('software-engineer');
    if (!swe) throw new RangeError('missing job');
    expect(skillFit(swe, 1, skills({ tech: 45 }))).toBeCloseTo(1 / 1.2, 5);
    expect(skillFit(swe, 1, skills({ tech: 90 }))).toBe(1);
  });

  it('issues a query letter first, then sacks repeat absentees', () => {
    let state: StrikeState = { strikes: 0, warnings: 0, lastWarningAt: null };
    const outcomes: string[] = [];
    for (let day = 1; day <= 6; day++) {
      const result = applyAttendanceDiscipline(state, 0, day * MINUTES_PER_DAY, MINUTES_PER_DAY);
      state = result.state;
      outcomes.push(result.outcome);
    }
    expect(outcomes).toEqual(['none', 'none', 'warning', 'none', 'none', 'fired']);
  });

  it('forgets an old query letter after a clean stretch', () => {
    const old: StrikeState = { strikes: 2, warnings: 1, lastWarningAt: 0 };
    expect(applyAttendanceDiscipline(old, 0, 90 * MINUTES_PER_DAY, MINUTES_PER_DAY).outcome).toBe('warning');
  });

  it('slowly clears strikes with full days', () => {
    const result = applyAttendanceDiscipline({ strikes: 2, warnings: 0, lastWarningAt: null }, 1, MINUTES_PER_DAY, MINUTES_PER_DAY);
    expect(result.state.strikes).toBe(1.75);
    expect(result.outcome).toBe('none');
  });
});
