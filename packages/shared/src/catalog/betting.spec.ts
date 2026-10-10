import { describe, expect, it } from 'vitest';
import {
  BET_MARKETS,
  BET_SELECTION_IDS,
  BETTING_CLUBS,
  BETTING_RULES,
  LEAGUE_CLOCK,
  combinedOdds,
  goalElapsed,
  isRoundOpen,
  lastKickedOffRound,
  leagueKickoff,
  leagueRound,
  leagueWeek,
  matchClock,
  matchIdOf,
  openLeagueRound,
  parseMatchId,
  selectionWins,
  slipReturns,
} from './betting.js';

describe('the Lagos League catalog', () => {
  it('has 16 distinct clubs (a 30-week double round robin of 8 matches)', () => {
    expect(BETTING_CLUBS).toHaveLength(16);
    expect(new Set(BETTING_CLUBS.map((club) => club.id)).size).toBe(16);
    expect(new Set(BETTING_CLUBS.map((club) => club.code)).size).toBe(16);
    expect(LEAGUE_CLOCK.weeksPerSeason).toBe((BETTING_CLUBS.length - 1) * 2);
    expect(LEAGUE_CLOCK.matchesPerWeek).toBe(BETTING_CLUBS.length / 2);
  });

  it('lists every selection in exactly one market', () => {
    const listed = Object.values(BET_MARKETS).flatMap((market) => market.selections);
    expect(listed.toSorted()).toEqual([...BET_SELECTION_IDS].toSorted());
  });
});

describe('the league clock', () => {
  it('opens the next kickoff for betting and keeps the last one on the board', () => {
    const t = leagueKickoff(100) + 17;
    expect(openLeagueRound(t)).toBe(101);
    expect(lastKickedOffRound(t)).toBe(100);
    // At the kickoff minute itself the round is no longer open.
    expect(openLeagueRound(leagueKickoff(101))).toBe(102);
    expect(openLeagueRound(leagueKickoff(101) - 1)).toBe(101);
    // The next two weeks are on sale; the one after isn't, and nothing is at or after its kickoff.
    expect([101, 102].map((round) => isRoundOpen(round, t))).toEqual([true, true]);
    expect(isRoundOpen(103, t)).toBe(false);
    expect(isRoundOpen(100, t)).toBe(false);
    expect(isRoundOpen(101, leagueKickoff(101))).toBe(false);
  });

  it('maps rounds to seasons and weeks', () => {
    expect(leagueWeek(61)).toEqual({ season: 2, week: 1 });
    expect(leagueRound(2, 1)).toBe(61);
  });

  it('round-trips match ids and refuses bad ones', () => {
    expect(parseMatchId(matchIdOf(61, 7))).toEqual({ round: 61, index: 7 });
    expect(parseMatchId('61-8')).toBeNull();
    expect(parseMatchId('abc')).toBeNull();
  });

  it('shows the scoreboard minute, half time and full time', () => {
    expect(matchClock(-1).label).toBe('KO');
    expect(matchClock(0).label).toBe("1'");
    expect(matchClock(44.9).label).toBe("45'");
    expect(matchClock(46).label).toBe('HT');
    expect(matchClock(48).label).toBe("46'");
    expect(matchClock(92.5).label).toBe("90'");
    expect(matchClock(LEAGUE_CLOCK.fullTimeAt).label).toBe('FT');
    // A goal in a minute shows up while the clock reads that minute.
    for (const minute of [1, 45, 46, 90]) expect(matchClock(goalElapsed(minute)).minute).toBe(minute);
  });
});

describe('markets', () => {
  it('settles each selection from the full-time score', () => {
    expect(selectionWins('1x2:home', 2, 1)).toBe(true);
    expect(selectionWins('1x2:draw', 1, 1)).toBe(true);
    expect(selectionWins('dc:x2', 1, 1)).toBe(true);
    expect(selectionWins('dc:12', 1, 1)).toBe(false);
    expect(selectionWins('ou25:over', 2, 1)).toBe(true);
    expect(selectionWins('ou25:under', 2, 0)).toBe(true);
    expect(selectionWins('ou15:over', 1, 0)).toBe(false);
    expect(selectionWins('ou35:under', 2, 1)).toBe(true);
    expect(selectionWins('btts:yes', 1, 0)).toBe(false);
    expect(selectionWins('btts:no', 0, 0)).toBe(true);
  });

  it('wins exactly one selection of every market with any score', () => {
    for (let home = 0; home <= 6; home++) {
      for (let away = 0; away <= 6; away++) {
        for (const market of Object.values(BET_MARKETS)) {
          const winners = market.selections.filter((id) => selectionWins(id, home, away)).length;
          expect(winners).toBe(market.id === 'dc' ? 2 : 1);
        }
      }
    }
  });
});

describe('accumulator maths', () => {
  it('multiplies the legs exactly and rounds the returns down to the naira', () => {
    expect(slipReturns(1_000, [235])).toEqual({ returns: 2_350, capped: false });
    expect(slipReturns(150, [133, 177])).toEqual({ returns: 353, capped: false }); // 150 × 1.33 × 1.77 = 353.1285
    expect(combinedOdds([133, 177])).toBe(2.35); // 2.3541 shown as 2.35
  });

  it('keeps ten long legs exact and caps the payout', () => {
    const legs = Array.from({ length: 10 }, () => 1_000); // 10.00 each: 10^10
    expect(combinedOdds(legs)).toBe(10_000_000_000);
    expect(slipReturns(100, legs)).toEqual({ returns: BETTING_RULES.maxPayout, capped: true });
    expect(slipReturns(100, Array.from({ length: 10 }, () => 101))).toEqual({ returns: 110, capped: false }); // 1.01^10 = 1.1046
  });
});
