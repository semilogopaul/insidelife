import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CreatePartyResultDto, TransferResultDto, WalletDto } from '@insidelife/shared';
import { bootApp, type E2eApp } from './support/app.js';
import { burst, fund } from './support/game.js';
import { ledgerViolations, NO_VIOLATIONS } from './support/ledger.js';
import { createPlayer, key, moveTo, ok, refused, setCreatedHoursAgo, verifyEmail, type Player } from './support/players.js';

let e2e: E2eApp;

beforeAll(async () => {
  e2e = await bootApp();
  e2e.clock.at(15);
});

afterAll(async () => {
  if (e2e) expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  await e2e?.close();
});

const send = (from: Player, to: Player, amount: number, idempotencyKey = key()) => from.post('/transfers', { toHandle: to.handle, amount, idempotencyKey });
const wallet = async (player: Player): Promise<WalletDto> => ok<WalletDto>(await player.get('/wallet'));
const statuses = (responses: ReadonlyArray<{ status: number }>): number[] => responses.map((response) => response.status).toSorted();

interface PeerDay {
  readonly sent: number;
  readonly received: number;
}

async function peerDay(player: Player): Promise<PeerDay> {
  const [row] = await e2e.dataSource.query<Array<{ sent: string; received: string }>>(`SELECT sent, received FROM peer_money_days WHERE character_id = $1 AND day = (now() AT TIME ZONE 'UTC')::date`, [player.characterId]);
  return { sent: Number(row?.sent ?? 0), received: Number(row?.received ?? 0) };
}

/** A player with money they may send (earned), on top of their locked starting money. */
async function sender(earned: number, setup: (player: Player) => Promise<void> = async () => undefined): Promise<Player> {
  const player = await createPlayer(e2e);
  await setup(player);
  await fund(e2e, player, earned);
  return player;
}

describe('transfers', () => {
  it('charge the bank fee and stamp duty on top, move the amount to the recipient, and the charges to fees', async () => {
    const from = await sender(1_000_000);
    const to = await createPlayer(e2e);
    const cases = [
      { amount: 4_000, fee: 0, stampDuty: 0 },
      { amount: 20_000, fee: 10, stampDuty: 50 },
      { amount: 100_000, fee: 50, stampDuty: 50 },
    ];
    for (const { amount, fee, stampDuty } of cases) {
      const [fromBefore, toBefore, toTotals] = [await from.cash(), await to.cash(), await to.character()];
      const receipt = ok<TransferResultDto>(await send(from, to, amount));
      expect(receipt).toMatchObject({ amount, fee, stampDuty, recipient: { handle: to.handle } });
      expect(await from.cash()).toBe(fromBefore - amount - fee - stampDuty);
      expect(receipt.balanceAfter).toBe(fromBefore - amount - fee - stampDuty);
      expect(await to.cash()).toBe(toBefore + amount);
      // Gifts from players are unearned for the recipient (they never count toward the self-made rich list).
      expect((await to.character()).unearned_total).toBe(toTotals.unearned_total + amount);
      const legs = await e2e.dataSource.query<Array<{ code: string | null; amount: string }>>(
        `SELECT a.code, e.amount FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id WHERE e.transaction_id = $1`,
        [receipt.transferId],
      );
      expect(legs.find((leg) => leg.code === 'system:fees')?.amount ?? '0').toBe(String(fee + stampDuty));
    }
    refused(await send(from, to, 99), 400);
    refused(await send(from, to, 5_000_001), 400);
    refused(await from.post('/transfers', { toHandle: from.handle, amount: 1_000, idempotencyKey: key() }), 422, 'SELF_TRANSFER');
    refused(await from.post('/transfers', { toHandle: 'nobody_here_x', amount: 1_000, idempotencyKey: key() }), 404);
  });

  it('Tier 1 (a new character) can send ₦4,000,000 a day', async () => {
    const from = await sender(9_000_000);
    const [a, b] = [await createPlayer(e2e), await createPlayer(e2e)];
    expect(await wallet(from)).toMatchObject({ transferTier: 1, dailyLimit: 4_000_000, sentToday: 0 });
    ok(await send(from, a, 4_000_000));
    refused(await send(from, b, 100), 422, 'DAILY_LIMIT_EXCEEDED');
    expect(await wallet(from)).toMatchObject({ sentToday: 4_000_000 });
  });

  it('Tier 2 (7+ game days old) can send ₦10,000,000 a day', async () => {
    const from = await sender(12_000_000, (player) => setCreatedHoursAgo(player, 3));
    expect(await wallet(from)).toMatchObject({ transferTier: 2, dailyLimit: 10_000_000 });
    const recipients = [await createPlayer(e2e), await createPlayer(e2e), await createPlayer(e2e), await createPlayer(e2e)];
    ok(await send(from, recipients[0]!, 4_000_000));
    ok(await send(from, recipients[1]!, 4_000_000));
    ok(await send(from, recipients[2]!, 2_000_000));
    refused(await send(from, recipients[3]!, 100), 422, 'DAILY_LIMIT_EXCEEDED');
  });

  it('Tier 3 (30+ game days old and a verified email) has no daily limit; age alone isn’t enough', async () => {
    const unverified = await sender(1_000_000, (player) => setCreatedHoursAgo(player, 10));
    expect((await wallet(unverified)).transferTier).toBe(2);

    const from = await sender(15_000_000, async (player) => {
      await setCreatedHoursAgo(player, 10);
      await verifyEmail(player);
    });
    expect(await wallet(from)).toMatchObject({ transferTier: 3, dailyLimit: null });
    for (let i = 0; i < 3; i++) ok(await send(from, await createPlayer(e2e), 4_000_000));
    expect((await wallet(from)).sentToday).toBe(12_000_000);
  });

  it('a player can receive at most ₦4,000,000 a day from other players', async () => {
    const to = await createPlayer(e2e);
    const [a, b, c] = [await sender(5_000_000), await sender(5_000_000), await sender(5_000_000)];
    ok(await send(a, to, 3_000_000));
    refused(await send(b, to, 1_500_000), 422, 'RECIPIENT_DAILY_LIMIT');
    ok(await send(b, to, 1_000_000));
    refused(await send(c, to, 100), 422, 'RECIPIENT_DAILY_LIMIT');
    expect(await wallet(to)).toMatchObject({ receivedToday: 4_000_000, receiveLimit: 4_000_000 });
    expect(await peerDay(to)).toEqual({ sent: 0, received: 4_000_000 });
    // The refused attempts left no trace on the would-be senders.
    expect(await peerDay(c)).toEqual({ sent: 0, received: 0 });
  });

  it('only earned, bought or received money can be sent; starting money stays locked', async () => {
    const from = await sender(50_000);
    const [to, onward] = [await createPlayer(e2e), await createPlayer(e2e)];
    expect((await wallet(from)).sendable).toBe(50_000);
    const tooMuch = await send(from, to, 50_001);
    refused(tooMuch, 422, 'STARTER_MONEY_LOCKED');
    expect(tooMuch.body.message).toMatch(/₦50,000/);
    ok(await send(from, to, 50_000));
    expect((await wallet(from)).sendable).toBe(0);
    refused(await send(from, to, 100), 422, 'STARTER_MONEY_LOCKED');

    // Money received from a player can be passed on.
    expect((await wallet(to)).sendable).toBe(50_000);
    ok(await send(to, onward, 50_000));
    refused(await send(to, onward, 100), 422, 'STARTER_MONEY_LOCKED');
  });

  it('a retried transfer (same key) sends once and returns the same receipt; a reused key for something else is refused', async () => {
    const from = await sender(2_000_000);
    const [to, other] = [await createPlayer(e2e), await createPlayer(e2e)];
    const before = await from.cash();
    const idempotencyKey = key();
    const first = ok<TransferResultDto>(await send(from, to, 250_000, idempotencyKey));
    const again = ok<TransferResultDto>(await send(from, to, 250_000, idempotencyKey));
    expect(again.transferId).toBe(first.transferId);
    const parallel = await burst(5, () => send(from, to, 250_000, idempotencyKey));
    expect(parallel.every((response) => response.status === 201 && response.body.transferId === first.transferId)).toBe(true);
    expect(await from.cash()).toBe(before - 250_100);
    refused(await send(from, to, 250_001, idempotencyKey), 409, 'IDEMPOTENCY_KEY_REUSED');
    refused(await send(from, other, 250_000, idempotencyKey), 409, 'IDEMPOTENCY_KEY_REUSED');

    // A fresh key sent several times at once also goes through once (another sender: transfers are limited to 10 a
    // minute per player, and this one has used them up).
    const second = await sender(1_000_000);
    const secondBefore = await second.cash();
    const burstKey = key();
    const results = await burst(6, () => send(second, other, 100_000, burstKey));
    expect(results.map((response) => response.status)).toEqual(Array.from({ length: 6 }, () => 201));
    expect(new Set(results.map((response) => response.body.transferId)).size).toBe(1);
    expect(await second.cash()).toBe(secondBefore - 100_100);
  });

  it('ten senders racing at one recipient can’t push them past the daily cap', async () => {
    const to = await createPlayer(e2e);
    const senders = await Promise.all(Array.from({ length: 10 }, () => sender(600_000)));
    const before = await Promise.all(senders.map((player) => player.cash()));
    const toBefore = await to.cash();
    const results = await Promise.all(senders.map((player) => send(player, to, 500_000)));
    expect(statuses(results)).toEqual([201, 201, 201, 201, 201, 201, 201, 201, 422, 422]);
    expect(results.filter((response) => response.status === 422).every((response) => response.body.errorCode === 'RECIPIENT_DAILY_LIMIT')).toBe(true);
    expect(await to.cash()).toBe(toBefore + 4_000_000);
    expect((await peerDay(to)).received).toBe(4_000_000);
    for (const [index, player] of senders.entries()) {
      const succeeded = results[index]!.status === 201;
      expect(await player.cash()).toBe(before[index]! - (succeeded ? 500_100 : 0));
      expect((await peerDay(player)).sent).toBe(succeeded ? 500_000 : 0);
    }
  });

  it('one sender racing two transfers past their own limit gets only one through', async () => {
    const from = await sender(8_000_000);
    const [a, b] = [await createPlayer(e2e), await createPlayer(e2e)];
    const before = await from.cash();
    const results = await Promise.all([send(from, a, 3_000_000), send(from, b, 3_000_000)]);
    expect(statuses(results)).toEqual([201, 422]);
    expect(results.find((response) => response.status === 422)?.body.errorCode).toBe('DAILY_LIMIT_EXCEEDED');
    expect(await from.cash()).toBe(before - 3_000_100);
    expect((await peerDay(from)).sent).toBe(3_000_000);
  });
});

const spray = (from: Player, toHandle: string | null, amount: number, idempotencyKey = key()) =>
  from.post('/venues/yaba-left-joint/sprays', { toHandle, amount, idempotencyKey });

describe('sprays count as player-to-player money', () => {
  it('club and bar sprays go through the same limits; spraying the DJ burns the money', async () => {
    const to = await createPlayer(e2e);
    const sprayer = await sender(2_000_000);
    const starterOnly = await createPlayer(e2e);
    const filler = await sender(4_000_000);
    for (const player of [to, sprayer, starterOnly]) await moveTo(player, 'yaba-left-joint');
    ok(await send(filler, to, 3_500_000));

    refused(await spray(sprayer, to.handle, 1_000_000), 422, 'RECIPIENT_DAILY_LIMIT');
    const toBefore = await to.cash();
    const sprayKey = key();
    ok(await spray(sprayer, to.handle, 500_000, sprayKey));
    const replay = ok<{ replayed?: boolean }>(await spray(sprayer, to.handle, 500_000, sprayKey));
    expect(replay.replayed).toBe(true);
    expect(await to.cash()).toBe(toBefore + 500_000);
    expect(await peerDay(to)).toMatchObject({ received: 4_000_000 });
    expect((await peerDay(sprayer)).sent).toBe(500_000);
    refused(await spray(starterOnly, to.handle, 500), 422, 'STARTER_MONEY_LOCKED');

    // The DJ isn't a player: starting money may be spent on him, and it leaves the game.
    const burnBefore = await e2e.dataSource.query<Array<{ total: string }>>(
      `SELECT COALESCE(SUM(e.amount), 0) AS total FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id WHERE a.code = 'system:burn'`,
    );
    const cashBefore = await starterOnly.cash();
    ok(await spray(starterOnly, null, 20_000));
    expect(await starterOnly.cash()).toBe(cashBefore - 20_000);
    const burnAfter = await e2e.dataSource.query<Array<{ total: string }>>(
      `SELECT COALESCE(SUM(e.amount), 0) AS total FROM ledger_entries e JOIN ledger_accounts a ON a.id = e.account_id WHERE a.code = 'system:burn'`,
    );
    expect(Number(burnAfter[0]!.total) - Number(burnBefore[0]!.total)).toBeGreaterThanOrEqual(20_000);
    expect(await peerDay(starterOnly)).toEqual({ sent: 0, received: 0 });
  });

  it('owambe sprays count toward the recipient’s daily cap and the sender’s locked money', async () => {
    const host = await createPlayer(e2e);
    const guest = await sender(3_000_000);
    const celebrant = await createPlayer(e2e);
    const starterOnly = await createPlayer(e2e);
    for (const player of [host, guest, celebrant, starterOnly]) await moveTo(player, 'yaba-left-joint');
    const party = ok<CreatePartyResultDto>(
      await host.post('/parties', { venueId: 'yaba-left-joint', title: 'Ada at 25', tier: 'small-chops', durationHours: 2, startsInMinutes: 0 }),
    );
    for (const player of [guest, celebrant, starterOnly]) ok(await player.post(`/parties/${party.party.id}/attendance`));

    const before = await celebrant.cash();
    ok(await guest.post(`/parties/${party.party.id}/sprays`, { toHandle: celebrant.handle, amount: 1_000_000, idempotencyKey: key() }));
    expect(await celebrant.cash()).toBe(before + 1_000_000);
    expect(await peerDay(celebrant)).toMatchObject({ received: 1_000_000 });
    expect((await peerDay(guest)).sent).toBe(1_000_000);
    refused(await starterOnly.post(`/parties/${party.party.id}/sprays`, { toHandle: celebrant.handle, amount: 500, idempotencyKey: key() }), 422, 'STARTER_MONEY_LOCKED');

    // The spray used a quarter of the celebrant's ₦4m: a ₦3.5m transfer no longer fits.
    const friend = await sender(4_000_000);
    refused(await send(friend, celebrant, 3_500_000), 422, 'RECIPIENT_DAILY_LIMIT');
    ok(await send(friend, celebrant, 3_000_000));
  });
});
