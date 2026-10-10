import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LEAGUE_CLOCK,
  type BetQuoteDto,
  type BetSlipsDto,
  type BettingAccountDto,
  type BettingLeagueDto,
  type PlaceBetResultDto,
} from '@insidelife/shared';
import { bootApp, type E2eApp } from './support/app.js';
import { burst, fund } from './support/game.js';
import { ledgerViolations, NO_VIOLATIONS } from './support/ledger.js';
import { createPlayer, key, ok, refused, type Player } from './support/players.js';

/**
 * Odogwu Odds, the betting app: slips against the house on the Lagos League. Stakes leave the game when placed (one
 * charge per tap-once key), slips settle in the bettor's own session after full time and pay once, nothing moves
 * between players, and the responsible-play rules (18+ by real age, loss limit, self-exclusion) hold at the API.
 */
let e2e: E2eApp;

beforeAll(async () => {
  e2e = await bootApp();
});

afterAll(async () => {
  if (e2e) expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  await e2e?.close();
});

const board = async (player: Player): Promise<BettingLeagueDto> => ok<BettingLeagueDto>(await player.get('/betting/league'));
const place = (player: Player, body: Record<string, unknown>) => player.post('/betting/slips', body);

/** A player with money and an adult account (the suite signs everyone up as born in 1996). */
async function bettor(cash = 200_000): Promise<Player> {
  const player = await createPlayer(e2e);
  await fund(e2e, player, cash);
  return player;
}

/** Cash postings of kind `betting` for a character (stakes negative, winnings positive). */
async function bettingFlows(characterId: string): Promise<{ staked: number; won: number }> {
  const rows = await e2e.dataSource.query<Array<{ staked: string; won: string }>>(
    `SELECT COALESCE(-SUM(e.amount) FILTER (WHERE e.amount < 0), 0)::bigint AS staked, COALESCE(SUM(e.amount) FILTER (WHERE e.amount > 0), 0)::bigint AS won
       FROM ledger_entries e
       JOIN ledger_accounts a ON a.id = e.account_id AND a.owner_id = $1 AND a.kind = 'cash'
       JOIN ledger_transactions t ON t.id = e.transaction_id AND t.kind = 'betting'`,
    [characterId],
  );
  return { staked: Number(rows[0]?.staked ?? 0), won: Number(rows[0]?.won ?? 0) };
}

describe('placing, settling and replaying slips', () => {
  it('charges a slip once, settles it after full time from the secret-seeded result and pays winners exactly once', async () => {
    const player = await bettor();
    const league = await board(player);
    const week = league.upcoming[0]!;
    expect(week.kickoffAt).toBeGreaterThan(e2e.clock.now);
    const [first, second, third] = week.fixtures;
    if (!first || !second || !third) throw new RangeError('expected a full week of fixtures');

    // The quote is the server's: odds and returns come from the board, never the client.
    const quote = ok<BetQuoteDto>(await player.post('/betting/quotes', { legs: [{ matchId: first.matchId, selection: '1x2:home' }], stake: 1_000 }));
    expect(quote.totalOdds).toBe(first.odds['1x2:home']);
    expect(quote.potentialReturns).toBe(Math.floor(1_000 * first.odds['1x2:home']! + 1e-9));
    expect(quote.problem).toBeNull();

    const before = await player.cash();
    // A single on each 1X2 outcome of one match: exactly one of the three must win.
    const singles: PlaceBetResultDto[] = [];
    for (const selection of ['1x2:home', '1x2:draw', '1x2:away'] as const) {
      singles.push(ok<PlaceBetResultDto>(await place(player, { legs: [{ matchId: first.matchId, selection }], stake: 1_000, idempotencyKey: key() })));
    }
    // A two-leg accumulator from different matches.
    const accaKey = key();
    const accaBody = {
      legs: [
        { matchId: second.matchId, selection: 'ou15:over' },
        { matchId: third.matchId, selection: 'dc:12' },
      ],
      stake: 500,
      idempotencyKey: accaKey,
    };
    const acca = ok<PlaceBetResultDto>(await place(player, accaBody));
    expect(acca.slip.totalOdds).toBeCloseTo(Math.floor(second.odds['ou15:over']! * third.odds['dc:12']! * 100 + 1e-9) / 100, 2);

    // Replays of the same tap (one after another and all at once) charge nothing more and return the same slip.
    expect(ok<PlaceBetResultDto>(await place(player, accaBody)).slip.id).toBe(acca.slip.id);
    const parallel = await burst(4, () => place(player, accaBody));
    expect(parallel.every((response) => response.status === 201 && response.body.slip.id === acca.slip.id)).toBe(true);
    expect(await player.cash()).toBe(before - 3_500);

    // The stake went to the burn sink with no counterparty: it's spending, never a transfer.
    const stakeLegs = await e2e.dataSource.query<Array<{ code: string | null; amount: string; counterparty: string | null }>>(
      `SELECT a.code, e.amount, t.counterparty_character_id AS counterparty
         FROM ledger_transactions t JOIN ledger_entries e ON e.transaction_id = t.id JOIN ledger_accounts a ON a.id = e.account_id
        WHERE t.idempotency_key = $1`,
      [`${player.characterId}:bet-stake:${accaKey}`],
    );
    expect(stakeLegs.map((leg) => [leg.code ?? 'player', Number(leg.amount)]).toSorted()).toEqual([['player', -500], ['system:burn', 500]].toSorted());
    expect(stakeLegs.every((leg) => leg.counterparty === null)).toBe(true);

    // Two picks from one match can't share a slip.
    refused(
      await place(player, {
        legs: [
          { matchId: first.matchId, selection: '1x2:home' },
          { matchId: first.matchId, selection: 'btts:yes' },
        ],
        stake: 500,
        idempotencyKey: key(),
      }),
      422,
      'SAME_MATCH',
    );

    // Before kickoff nothing about the result is out.
    refused(await player.get(`/betting/results?round=${week.round}`), 422, 'NOT_PLAYED_YET');

    // Kickoff (server time): no more bets on it, and the timeline is public.
    e2e.clock.advance(week.kickoffAt - e2e.clock.now);
    refused(await place(player, { legs: [{ matchId: first.matchId, selection: '1x2:home' }], stake: 1_000, idempotencyKey: key() }), 422, 'KICKED_OFF');
    const live = await board(player);
    expect(live.live?.round).toBe(week.round);
    const result = live.live!.matches.find((match) => match.matchId === first.matchId)!;
    // Still open at half time: nothing settles before full time.
    e2e.clock.advance(LEAGUE_CLOCK.halfLength);
    expect(ok<BetSlipsDto>(await player.get('/betting/slips')).slips.every((slip) => slip.status === 'open')).toBe(true);

    // Full time: the bettor's own session settles the slips.
    e2e.clock.advance(LEAGUE_CLOCK.fullTimeAt - LEAGUE_CLOCK.halfLength + 1);
    const settled = ok<BetSlipsDto>(await player.get('/betting/slips')).slips;
    const winningSelection = result.home > result.away ? '1x2:home' : result.home === result.away ? '1x2:draw' : '1x2:away';
    const singlesNow = settled.filter((slip) => singles.some((placed) => placed.slip.id === slip.id));
    expect(singlesNow.map((slip) => slip.status).toSorted()).toEqual(['lost', 'lost', 'won']);
    const winner = singlesNow.find((slip) => slip.status === 'won')!;
    expect(winner.legs[0]?.selection).toBe(winningSelection);
    expect(winner.legs[0]?.score).toEqual({ home: result.home, away: result.away });
    expect(winner.payout).toBe(winner.potentialReturns);
    expect(settled.find((slip) => slip.id === acca.slip.id)?.status).not.toBe('open');

    // Paid once: refetching (slips, snapshot, the account) never pays again.
    await player.get('/betting/slips');
    await player.snapshot();
    ok<BettingAccountDto>(await player.get('/betting/me'));
    const winPostings = await e2e.dataSource.query<Array<{ n: number }>>(`SELECT COUNT(*)::int AS n FROM ledger_transactions WHERE idempotency_key = $1`, [
      `${player.characterId}:bet-win:${winner.id}`,
    ]);
    expect(winPostings[0]?.n).toBe(1);
    const accaWon = settled.find((slip) => slip.id === acca.slip.id)!;
    const paid = winner.payout + accaWon.payout;
    expect(await player.cash()).toBe(before - 3_500 + paid);

    // Winnings are unearned income (they never count as self-made), and a notification says so.
    const character = await player.character();
    expect(character.unearned_total).toBeGreaterThanOrEqual(paid);
    const notes = await e2e.dataSource.query<Array<{ title: string }>>(`SELECT title FROM notifications WHERE character_id = $1 AND title LIKE '%slip came in%'`, [player.characterId]);
    expect(notes.length).toBe(accaWon.payout > 0 ? 2 : 1);

    // The house: stakes − winnings is exactly what this player's betting burned.
    const flows = await bettingFlows(player.characterId);
    expect(flows).toEqual({ staked: 3_500, won: paid });
    const slips = await e2e.dataSource.query<Array<{ staked: string; paid: string }>>(
      `SELECT SUM(stake)::bigint AS staked, SUM(payout)::bigint AS paid FROM betting_slips WHERE character_id = $1`,
      [player.characterId],
    );
    expect(Number(slips[0]?.staked) - Number(slips[0]?.paid)).toBe(flows.staked - flows.won);
  });
});

describe('responsible play', () => {
  it('refuses under-18s by real age and asks a missing date of birth first (once)', async () => {
    const player = await bettor();
    const fixture = (await board(player)).upcoming[0]!.fixtures[0]!;
    const slip = { legs: [{ matchId: fixture.matchId, selection: '1x2:draw' }], stake: 500 };

    const sixteen = new Date(Date.now() - 16 * 365.25 * 24 * 3_600_000).toISOString().slice(0, 10);
    await e2e.dataSource.query(`UPDATE users SET birth_date = $2 WHERE id = $1`, [player.userId, sixteen]);
    expect(ok<BettingAccountDto>(await player.get('/betting/me')).block).toBe('under-age');
    refused(await place(player, { ...slip, idempotencyKey: key() }), 422, 'NOT_ELIGIBLE');
    expect(ok<BetQuoteDto>(await player.post('/betting/quotes', slip)).problem).toMatch(/18/);

    await e2e.dataSource.query(`UPDATE users SET birth_date = NULL WHERE id = $1`, [player.userId]);
    expect(ok<BettingAccountDto>(await player.get('/betting/me')).block).toBe('confirm-birth-date');
    refused(await place(player, { ...slip, idempotencyKey: key() }), 422, 'NOT_ELIGIBLE');
    expect(ok<BettingAccountDto>(await player.put('/betting/me/birth-date', { birthDate: '1994-02-03' })).block).toBeNull();
    // Once on the account it can't be swapped for another date.
    refused(await player.put('/betting/me/birth-date', { birthDate: '1990-01-01' }), 422, 'BIRTH_DATE_SET');
    ok<PlaceBetResultDto>(await place(player, { ...slip, idempotencyKey: key() }));
  });

  it('holds the daily loss limit: lower at once, a raise only after the cooling-off', async () => {
    const player = await bettor();
    const fixture = (await board(player)).upcoming[0]!.fixtures[1]!;
    const slip = (stake: number) => ({ legs: [{ matchId: fixture.matchId, selection: '1x2:home' }], stake, idempotencyKey: key() });

    const lowered = ok<BettingAccountDto>(await player.put('/betting/me/limits', { dailyLossLimit: 2_000, realityCheckMinutes: 15 }));
    expect(lowered.limits).toMatchObject({ dailyLossLimit: 2_000, realityCheckMinutes: 15, pendingDailyLossLimit: null });
    ok<PlaceBetResultDto>(await place(player, slip(1_500)));
    refused(await place(player, slip(600)), 422, 'LOSS_LIMIT');
    ok<PlaceBetResultDto>(await place(player, slip(500)));

    const raised = ok<BettingAccountDto>(await player.put('/betting/me/limits', { dailyLossLimit: 1_000_000 }));
    expect(raised.limits.dailyLossLimit).toBe(2_000);
    expect(raised.limits.pendingDailyLossLimit?.amount).toBe(1_000_000);
    refused(await place(player, slip(100)), 422, 'LOSS_LIMIT');
    refused(await player.put('/betting/me/limits', { dailyLossLimit: 5_000_001 }), 422, 'LIMIT_TOO_HIGH');
  });

  it('keeps a self-excluded player off the board until the break ends, with no way to cut it short', async () => {
    const player = await bettor();
    const fixture = (await board(player)).upcoming[0]!.fixtures[2]!;
    const excluded = ok<BettingAccountDto>(await player.post('/betting/me/self-exclusions', { days: 7 }));
    expect(excluded.block).toBe('self-excluded');
    const until = excluded.excludedUntil!;
    expect(Date.parse(until) - Date.now()).toBeGreaterThan(6.9 * 24 * 3_600_000);
    // Asking for a shorter break changes nothing.
    expect(ok<BettingAccountDto>(await player.post('/betting/me/self-exclusions', { days: 1 })).excludedUntil).toBe(until);
    refused(await place(player, { legs: [{ matchId: fixture.matchId, selection: '1x2:away' }], stake: 500, idempotencyKey: key() }), 422, 'SELF_EXCLUDED');
    refused(await player.post('/betting/me/self-exclusions', { days: 3 }), 400);
  });
});
