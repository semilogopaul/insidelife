import { describe, expect, it } from 'vitest';
import { MORNING_HOURS, sceneHour } from './daylight';

describe('daylight lock', () => {
  it('draws every game hour as morning', () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      const drawn = sceneHour(hour, true);
      expect(drawn).toBeGreaterThanOrEqual(MORNING_HOURS.from);
      expect(drawn).toBeLessThanOrEqual(MORNING_HOURS.to);
    }
  });

  it('moves smoothly with no jump at midnight', () => {
    expect(sceneHour(0, true)).toBeCloseTo(sceneHour(24, true));
    expect(sceneHour(23.99, true)).toBeCloseTo(sceneHour(0.01, true), 2);
    expect(sceneHour(12, true)).toBe(MORNING_HOURS.to);
  });

  it('leaves the hour alone when the lock is off', () => {
    expect(sceneHour(22, false)).toBe(22);
  });
});
