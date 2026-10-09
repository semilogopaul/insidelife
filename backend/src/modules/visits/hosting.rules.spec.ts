import { HOSTING_RULES, MINUTES_PER_DAY, findHostTreat, type HostTreatDefinition } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { closenessGain, dayStart, hostReward, treatProblem, type TreatCheckInput } from './hosting.rules.js';

const treat = (id: string): HostTreatDefinition => {
  const def = findHostTreat(id);
  if (!def) throw new Error(`no treat ${id}`);
  return def;
};

const ok: TreatCheckInput = {
  def: treat('suya-platter'),
  atHome: true,
  guests: 2,
  hostAdult: true,
  guestsAdult: true,
  pantryMeals: 0,
  pantryNeeded: 0,
  cash: 1_000_000,
  total: 27_000,
  onTable: false,
};

describe('treatProblem', () => {
  it('serves when you are home with guests inside and can pay', () => {
    expect(treatProblem(ok)).toBeNull();
  });

  it.each([
    [{ atHome: false }, 'NOT_HOME'],
    [{ guests: 0 }, 'NO_GUESTS'],
    [{ def: treat('beer'), hostAdult: false }, 'TOO_YOUNG'],
    [{ def: treat('champagne'), guestsAdult: false }, 'UNDER_18_GUEST'],
    [{ onTable: true }, 'STILL_ON_TABLE'],
    [{ def: treat('home-cooked'), total: 0, pantryMeals: 2, pantryNeeded: 3 }, 'PANTRY_SHORT'],
    [{ cash: 10_000 }, 'INSUFFICIENT_FUNDS'],
  ] as const)('refuses %o with %s', (change, code) => {
    expect(treatProblem({ ...ok, ...change })?.code).toBe(code);
  });

  it('lets an under-18 guest have soft drinks and food', () => {
    expect(
      treatProblem({ ...ok, def: treat('soft-drinks'), guestsAdult: false, hostAdult: false }),
    ).toBeNull();
    expect(treatProblem({ ...ok, def: treat('jollof-chicken'), guestsAdult: false })).toBeNull();
  });

  it('cooks from a full enough pantry without cash', () => {
    expect(
      treatProblem({ ...ok, def: treat('home-cooked'), cash: 0, total: 0, pantryMeals: 3, pantryNeeded: 3 }),
    ).toBeNull();
  });
});

describe('hostReward', () => {
  it('rewards the first treats of the day, then nothing (no farming)', () => {
    const suya = treat('suya-platter');
    expect(hostReward([], suya)).toEqual({ rewarded: true, clout: 1 });
    const done = Array.from({ length: HOSTING_RULES.maxRewardedTreatsPerDay }, () => 'suya-platter' as const);
    expect(hostReward(done, suya)).toEqual({ rewarded: false, clout: 0 });
  });

  it('caps clout per day, counting what earlier treats gave', () => {
    expect(hostReward([], treat('champagne')).clout).toBe(HOSTING_RULES.maxCloutPerDay);
    expect(hostReward(['champagne'], treat('suya-platter'))).toEqual({ rewarded: true, clout: 0 });
    expect(hostReward(['soft-drinks'], treat('cake')).clout).toBe(1);
  });

  it('gives no clout for the free pot or a round of minerals', () => {
    expect(hostReward([], treat('home-cooked')).clout).toBe(0);
    expect(hostReward([], treat('soft-drinks')).clout).toBe(0);
  });
});

describe('closenessGain', () => {
  it('caps what a guest gains with one host per day', () => {
    expect(closenessGain(3, 0)).toBe(3);
    expect(closenessGain(3, HOSTING_RULES.maxClosenessPerDay - 1)).toBe(1);
    expect(closenessGain(3, HOSTING_RULES.maxClosenessPerDay)).toBe(0);
  });
});

describe('dayStart', () => {
  it('rounds down to midnight', () => {
    expect(dayStart(3 * MINUTES_PER_DAY + 125)).toBe(3 * MINUTES_PER_DAY);
  });
});
