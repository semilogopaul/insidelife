import { describe, expect, it } from 'vitest';
import { BETTING_RULES, LEAGUE_CLOCK } from '@insidelife/shared';
import {
  bettingBlock,
  changeLossLimit,
  checkLossLimit,
  checkSlip,
  effectiveLossLimit,
  exclusionEnd,
} from './slip.rules.js';

const NOW_MS = Date.UTC(2026, 9, 10, 12, 0, 0);
const DAY_MS = 24 * 60 * 60_000;
const KICKOFF = 10_000;
const leg = (matchId: string, kickoffAt = KICKOFF, odds: number | null = 185) => ({
  matchId,
  kickoffAt,
  odds,
});
const slip = (legs: ReturnType<typeof leg>[], stake = 1_000, now = KICKOFF - 30) =>
  checkSlip({ legs, stake, now, maxStake: 1_000_000 });

describe('18+ by real age', () => {
  const adult = { birthDate: '1990-01-01', nowMs: NOW_MS, excludedUntil: null, characterAge: 25 };

  it('lets adults bet', () => {
    expect(bettingBlock(adult)).toBeNull();
  });

  it('refuses anyone under 18 by their real date of birth, whatever the character’s age', () => {
    expect(bettingBlock({ ...adult, birthDate: '2009-06-01', characterAge: 40 })?.block).toBe('under-age');
    // The 18th birthday counts from Lagos midnight.
    expect(bettingBlock({ ...adult, birthDate: '2008-10-10' })).toBeNull();
    expect(bettingBlock({ ...adult, birthDate: '2008-10-11' })?.block).toBe('under-age');
  });

  it('asks for a missing date of birth before anything else', () => {
    expect(bettingBlock({ ...adult, birthDate: null })?.block).toBe('confirm-birth-date');
  });

  it('keeps a self-excluded player out until the break ends', () => {
    expect(bettingBlock({ ...adult, excludedUntil: new Date(NOW_MS + 1_000) })?.block).toBe('self-excluded');
    expect(bettingBlock({ ...adult, excludedUntil: new Date(NOW_MS - 1_000) })).toBeNull();
  });

  it('needs an adult character too', () => {
    expect(bettingBlock({ ...adult, characterAge: 17 })?.block).toBe('character-under-age');
  });
});

describe('the kickoff cut-off and the slip', () => {
  it('accepts singles and accumulators before kickoff', () => {
    expect(slip([leg('1-0')])).toEqual({ ok: true });
    // Two weeks are on the board, so a ten-leg accumulator fits.
    const next = KICKOFF + LEAGUE_CLOCK.roundMinutes;
    const twoWeeks = [
      ...Array.from({ length: 8 }, (_, i) => leg(`1-${i}`)),
      leg('2-0', next),
      leg('2-1', next),
    ];
    expect(slip(twoWeeks, 1_000, KICKOFF - 1)).toEqual({ ok: true });
    // The week after those isn't on sale yet.
    expect(slip([leg('3-0', next + LEAGUE_CLOCK.roundMinutes)], 1_000, KICKOFF - 1)).toMatchObject({
      ok: false,
      code: 'NOT_OPEN',
    });
  });

  it('refuses any bet at or after kickoff (server time)', () => {
    expect(slip([leg('1-0')], 1_000, KICKOFF - 1).ok).toBe(true);
    expect(slip([leg('1-0')], 1_000, KICKOFF)).toMatchObject({ ok: false, code: 'KICKED_OFF' });
    expect(slip([leg('1-0')], 1_000, KICKOFF + 5)).toMatchObject({ ok: false, code: 'KICKED_OFF' });
  });

  it('refuses a week whose window hasn’t opened', () => {
    const opens = KICKOFF - LEAGUE_CLOCK.openWeeks * LEAGUE_CLOCK.roundMinutes;
    expect(slip([leg('1-0', KICKOFF)], 1_000, opens - 1)).toMatchObject({ ok: false, code: 'NOT_OPEN' });
    expect(slip([leg('1-0', KICKOFF)], 1_000, opens).ok).toBe(true);
  });

  it('allows up to 10 legs, never two from the same match', () => {
    const ten = Array.from({ length: 8 }, (_, i) => leg(`1-${i}`));
    expect(slip(ten).ok).toBe(true);
    expect(slip(Array.from({ length: 11 }, (_, i) => leg(`1-${i}`)))).toMatchObject({
      ok: false,
      code: 'TOO_MANY_LEGS',
    });
    expect(slip([leg('1-0'), leg('1-0')])).toMatchObject({ ok: false, code: 'SAME_MATCH' });
    expect(slip([])).toMatchObject({ ok: false, code: 'EMPTY_SLIP' });
  });

  it('refuses selections off the board', () => {
    expect(slip([leg('1-0', KICKOFF, null)])).toMatchObject({ ok: false, code: 'OFF_THE_BOARD' });
  });

  it('keeps stakes between ₦100 and the maximum', () => {
    expect(slip([leg('1-0')], 99)).toMatchObject({ ok: false, code: 'STAKE_TOO_LOW' });
    expect(slip([leg('1-0')], 100).ok).toBe(true);
    expect(slip([leg('1-0')], 1_000_000).ok).toBe(true);
    expect(slip([leg('1-0')], 1_000_001)).toMatchObject({ ok: false, code: 'STAKE_TOO_HIGH' });
    expect(slip([leg('1-0')], 150.5)).toMatchObject({ ok: false, code: 'STAKE_TOO_LOW' });
  });
});

describe('the daily loss limit', () => {
  it('counts every new stake as lost and winnings back against it', () => {
    expect(checkLossLimit({ netLossToday: 4_000_000, stake: 1_000_000, limit: 5_000_000 }).ok).toBe(true);
    expect(checkLossLimit({ netLossToday: 4_000_001, stake: 1_000_000, limit: 5_000_000 })).toMatchObject({
      ok: false,
      code: 'LOSS_LIMIT',
    });
    // A good day (more won than staked) leaves more room.
    expect(checkLossLimit({ netLossToday: -2_000_000, stake: 1_000_000, limit: 5_000_000 }).ok).toBe(true);
  });

  it('applies a lower limit at once and a higher one only after the cooling-off', () => {
    const max = BETTING_RULES.defaultDailyLossLimit;
    const lower = changeLossLimit({ limit: null, pending: null, pendingAt: null }, 50_000, NOW_MS, max);
    expect(lower).toMatchObject({ ok: true, limit: 50_000, pending: null });
    const raise = changeLossLimit({ limit: 50_000, pending: null, pendingAt: null }, 1_000_000, NOW_MS, max);
    expect(raise).toMatchObject({ ok: true, limit: 50_000, pending: 1_000_000 });
    if (!raise.ok) throw new RangeError('expected a pending raise');
    const state = { limit: raise.limit, pending: raise.pending, pendingAt: raise.pendingAt };
    expect(effectiveLossLimit(state, NOW_MS + 60_000, max)).toBe(50_000);
    expect(effectiveLossLimit(state, NOW_MS + BETTING_RULES.limitRaiseDelayHours * 3_600_000, max)).toBe(
      1_000_000,
    );
    expect(changeLossLimit(state, max + 1, NOW_MS, max)).toMatchObject({ ok: false, code: 'LIMIT_TOO_HIGH' });
    expect(effectiveLossLimit({ limit: null, pending: null, pendingAt: null }, NOW_MS, max)).toBe(max);
  });
});

describe('self-exclusion', () => {
  it('runs for whole real days and can only be extended', () => {
    const week = exclusionEnd(null, 7, NOW_MS);
    expect(week.getTime()).toBe(NOW_MS + 7 * DAY_MS);
    // Asking for a shorter break during a longer one changes nothing.
    expect(exclusionEnd(week, 1, NOW_MS + DAY_MS).getTime()).toBe(week.getTime());
    expect(exclusionEnd(week, 30, NOW_MS).getTime()).toBe(NOW_MS + 30 * DAY_MS);
  });
});
