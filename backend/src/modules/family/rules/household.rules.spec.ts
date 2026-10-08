import { MINUTES_PER_DAY } from '@insidelife/shared';
import { effectiveCloseness, effectiveRomance } from './closeness.rules.js';
import { childcareMonthlyBase, householdLivingMultiplier } from './household.rules.js';
import { annualDeathChance, dailyDeathChance } from './mortality.rules.js';
import { strangerAgeRange } from './people.rules.js';

describe('household, closeness and lifecycle rules', () => {
  it('shares bills with a working spouse and adds 12% per child', () => {
    expect(householdLivingMultiplier(false, 0)).toBe(1);
    expect(householdLivingMultiplier(true, 0)).toBeCloseTo(0.8);
    expect(householdLivingMultiplier(false, 2)).toBeCloseTo(1.24);
    expect(householdLivingMultiplier(true, 3)).toBeCloseTo(0.8 * 1.36);
  });

  it('charges a nanny for under-5s unless someone stays home', () => {
    expect(childcareMonthlyBase(0, false)).toBe(0);
    expect(childcareMonthlyBase(1, false)).toBe(80_000);
    expect(childcareMonthlyBase(2, false)).toBe(105_000);
    expect(childcareMonthlyBase(2, true)).toBe(0);
  });

  it('cools friendships after a grace period, but family never drops below the floor', () => {
    const day = MINUTES_PER_DAY;
    const friend = { closeness: 60, lastContactAt: 0, kind: 'friend' as const };
    expect(effectiveCloseness(friend, 5 * day)).toBe(60);
    expect(effectiveCloseness(friend, 17 * day)).toBeCloseTo(56);
    const mother = { closeness: 40, lastContactAt: 0, kind: 'mother' as const };
    expect(effectiveCloseness(mother, 1_000 * day)).toBe(15);
    const partner = { romance: 70, lastRomanceAt: 0, kind: 'partner' as const };
    expect(effectiveRomance(partner, 15 * day)).toBeCloseTo(65);
    expect(effectiveRomance(partner, 15 * day, true)).toBeCloseTo(60);
  });

  it('makes death rare for parents in their 40s-50s and likelier with age', () => {
    expect(annualDeathChance(45)).toBeLessThan(0.01);
    expect(annualDeathChance(80)).toBeGreaterThan(annualDeathChance(60));
    expect(dailyDeathChance(70)).toBeLessThan(annualDeathChance(70) / 300);
  });

  it('meets people of an appropriate age for the venue and for you', () => {
    expect(strangerAgeRange('campus', 18)).toEqual([17, 26]);
    expect(strangerAgeRange('club', 17)).toEqual([20, 25]);
    expect(strangerAgeRange('office', 40)).toEqual([35, 48]);
    const [min] = strangerAgeRange('church', 17);
    expect(min).toBeGreaterThanOrEqual(17);
  });
});
