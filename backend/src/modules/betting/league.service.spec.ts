import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import {
  BET_SELECTION_IDS,
  LEAGUE_CLOCK,
  leagueKickoff,
  leagueRound,
  type GameMinute,
} from '@insidelife/shared';
import type { AppConfig } from '../../config/configuration.js';
import type { WorldService } from '../world/world.service.js';
import { LeagueService } from './league.service.js';

const JWT = 'q8Zr2LxVw9mP4tYb7Kc1Hn6Jd3Fg5Ss0Ue8Ai2Ox7Rk4Wl9Mz';

function league(
  secret: string,
  worldSeed = 'public-world-seed',
  now: GameMinute = leagueKickoff(leagueRound(3, 10)) + 10,
): LeagueService {
  const values = {
    betting: { secret, maxStake: 1_000_000, dailyLossLimit: 5_000_000 },
    auth: { accessSecret: JWT },
  };
  const config = { get: (key: keyof typeof values) => values[key] } as unknown as ConfigService<
    AppConfig,
    true
  >;
  const world = { now: () => now, seed: worldSeed } as unknown as WorldService;
  return new LeagueService(world, config);
}

const scores = (service: LeagueService, round: number): string[] =>
  service
    .roundMatches(round)
    .map((match) => `${match.homeId} ${match.result.home}-${match.result.away} ${match.awayId}`);

describe('the league secret', () => {
  const round = leagueRound(3, 10);

  it('draws the same results on every node with the same secret, whatever the public world seed', () => {
    expect(scores(league('secret-A'.repeat(4), 'seed-1'), round)).toEqual(
      scores(league('secret-A'.repeat(4), 'seed-2'), round),
    );
  });

  it('draws different results with a different secret', () => {
    const a = league('secret-A'.repeat(4));
    const b = league('secret-B'.repeat(4));
    const weeks = Array.from({ length: 5 }, (_, week) => leagueRound(3, week));
    expect(weeks.map((week) => scores(a, week))).not.toEqual(weeks.map((week) => scores(b, week)));
  });

  it('derives a secret from the JWT secret when BETTING_SECRET is unset (local only)', () => {
    expect(scores(league(''), round)).toEqual(scores(league(''), round));
    expect(scores(league(''), round)).not.toEqual(scores(league('secret-A'.repeat(4)), round));
  });
});

describe('the board', () => {
  const kickoff = leagueKickoff(leagueRound(3, 10));

  it('prices the open week and reveals only the week that has kicked off', () => {
    const service = league('secret-A'.repeat(4), 'w', kickoff + 10);
    const board = service.board();
    expect(board.upcoming.map((week) => week.kickoffAt)).toEqual([
      kickoff + LEAGUE_CLOCK.roundMinutes,
      kickoff + 2 * LEAGUE_CLOCK.roundMinutes,
    ]);
    for (const fixture of board.upcoming.flatMap((week) => week.fixtures)) {
      expect(Object.keys(fixture.odds).toSorted()).toEqual([...BET_SELECTION_IDS].toSorted());
      // No score, no goals: only odds go out before kickoff.
      expect(fixture).not.toHaveProperty('goals');
      expect(fixture).not.toHaveProperty('home');
      expect(fixture.odds['1x2:home']).toBeGreaterThan(1);
    }
    expect(board.upcoming[0]?.fixtures).toHaveLength(LEAGUE_CLOCK.matchesPerWeek);
    expect(board.live?.kickoffAt).toBe(kickoff);
    expect(board.live?.matches.every((match) => match.goals.length === match.home + match.away)).toBe(true);
  });

  it('refuses results for weeks that haven’t kicked off', () => {
    const service = league('secret-A'.repeat(4), 'w', kickoff + 10);
    expect(() => service.results(leagueRound(3, 11))).toThrow();
    expect(service.results(undefined).round).toBe(leagueRound(3, 10));
  });

  it('builds the table from finished weeks only', () => {
    const live = league('secret-A'.repeat(4), 'w', kickoff + 10).table();
    expect(live.weeksPlayed).toBe(10);
    const over = league('secret-A'.repeat(4), 'w', kickoff + LEAGUE_CLOCK.fullTimeAt).table();
    expect(over.weeksPlayed).toBe(11);
    expect(over.rows).toHaveLength(16);
    expect(over.rows.every((row) => row.played === 11 && row.won + row.drawn + row.lost === 11)).toBe(true);
    expect(over.rows.reduce((sum, row) => sum + row.goalsFor - row.goalsAgainst, 0)).toBe(0);
    for (let i = 1; i < over.rows.length; i++)
      expect(over.rows[i - 1]!.points).toBeGreaterThanOrEqual(over.rows[i]!.points);
  });

  it('drifts strengths from season to season', () => {
    const service = league('secret-A'.repeat(4));
    expect([...service.strengths(3).values()]).not.toEqual([...service.strengths(4).values()]);
  });
});
