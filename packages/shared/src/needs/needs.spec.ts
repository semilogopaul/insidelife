import { describe, expect, it } from 'vitest';
import { computeMood, driftNeed, moodPerformanceMultiplier, needsAlongTimeline, projectNeeds, type NeedProfile, type Needs } from './needs.js';

const FULL: Needs = { energy: 100, hunger: 100, hygiene: 100, fun: 100, social: 100 };
const DRAIN: NeedProfile = {
  energy: { target: 0, rate: 4 },
  hunger: { target: 0, rate: 5 },
  hygiene: { target: 0, rate: 2 },
  fun: { target: 0, rate: 3 },
  social: { target: 0, rate: 2 },
};

describe('needs model', () => {
  it('drifts linearly toward the target and stops there', () => {
    expect(driftNeed(80, { target: 50, rate: 10 }, 2)).toBe(60);
    expect(driftNeed(80, { target: 50, rate: 10 }, 5)).toBe(50);
    expect(driftNeed(20, { target: 50, rate: 10 }, 1)).toBe(30);
  });

  it('projects every need with its own rate', () => {
    const after = projectNeeds(FULL, DRAIN, 10);
    expect(after).toEqual({ energy: 60, hunger: 50, hygiene: 80, fun: 70, social: 80 });
  });

  it('walks a timeline exactly like one long projection when segments chain', () => {
    const segments = [
      { startsAt: 0, endsAt: 300, profile: DRAIN },
      { startsAt: 300, endsAt: 600, profile: DRAIN },
    ];
    expect(needsAlongTimeline(FULL, 0, segments, 600)).toEqual(projectNeeds(FULL, DRAIN, 10));
  });

  it('only counts the part of a segment after the starting point', () => {
    const segments = [{ startsAt: 0, endsAt: 600, profile: DRAIN }];
    expect(needsAlongTimeline(FULL, 300, segments, 600)).toEqual(projectNeeds(FULL, DRAIN, 5));
  });

  it('drags mood down hard when a need is in the red', () => {
    const fine = computeMood({ energy: 60, hunger: 60, hygiene: 60, fun: 60, social: 60 });
    const starving = computeMood({ energy: 60, hunger: 2, hygiene: 60, fun: 60, social: 60 });
    expect(fine).toBe(60);
    expect(starving).toBeLessThan(fine - 20);
  });

  it('scales performance from 0.6 to 1.25', () => {
    expect(moodPerformanceMultiplier(0)).toBeCloseTo(0.6);
    expect(moodPerformanceMultiplier(50)).toBeCloseTo(1);
    expect(moodPerformanceMultiplier(100)).toBeCloseTo(1.25);
  });
});
