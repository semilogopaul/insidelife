import { describe, expect, it } from 'vitest';
import { DAYS_PER_YEAR, MINUTES_PER_DAY, fromDateParts } from '../time/calendar.js';
import { activeWorldEvents, economyOn, weatherAt, worldEventMinutesBetween, worldEventsForYear } from './world.js';

const SEED = 'test-seed';

describe('world model', () => {
  it('is deterministic', () => {
    expect(worldEventsForYear(SEED, 2030)).toEqual(worldEventsForYear(SEED, 2030));
    expect(economyOn(SEED, 1234)).toEqual(economyOn(SEED, 1234));
    expect(weatherAt(SEED, 99_999)).toEqual(weatherAt(SEED, 99_999));
  });

  it('keeps the economy mean-reverting within sane bounds for decades', () => {
    for (let day = 0; day < DAYS_PER_YEAR * 40; day += 7) {
      const economy = economyOn(SEED, day);
      expect(economy.priceIndex).toBeGreaterThanOrEqual(0.82);
      expect(economy.priceIndex).toBeLessThanOrEqual(1.4);
      expect(economy.usdRate).toBeGreaterThan(900);
      expect(economy.usdRate).toBeLessThan(2400);
      expect(economy.tbillRate).toBeGreaterThan(0.07);
      expect(economy.tbillRate).toBeLessThan(0.15);
    }
  });

  it('always has Christmas and Detty December', () => {
    const t = fromDateParts({ year: 2031, month: 12, day: 25, hour: 12 });
    const kinds = activeWorldEvents(SEED, t).map((event) => event.kind);
    expect(kinds).toContain('detty-december');
    expect(kinds).toContain('public-holiday');
  });

  it('rains far more in the rainy season than in harmattan', () => {
    let rainy = 0;
    let harmattan = 0;
    for (let year = 2027; year < 2037; year++) {
      for (let day = 0; day < 30; day++) {
        for (let block = 0; block < 8; block++) {
          if (weatherAt(SEED, fromDateParts({ year, month: 6, day: day + 1 }) + block * 180).raining) rainy++;
          if (weatherAt(SEED, fromDateParts({ year, month: 1, day: day + 1 }) + block * 180).raining) harmattan++;
        }
      }
    }
    expect(rainy).toBeGreaterThan(harmattan * 5);
  });

  it('measures strike time overlapping a degree', () => {
    const start = fromDateParts({ year: 2027, month: 1, day: 1 });
    const end = start + 4 * DAYS_PER_YEAR * MINUTES_PER_DAY;
    const strike = worldEventMinutesBetween(SEED, 'asuu-strike', start, end);
    expect(strike).toBeGreaterThanOrEqual(0);
    expect(strike).toBeLessThan(end - start);
  });
});
