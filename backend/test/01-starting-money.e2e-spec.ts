import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BACKGROUNDS, STARTER_FUND, type BackgroundId } from '@insidelife/shared';
import { bootApp, type E2eApp } from './support/app.js';
import { cashFlowsByKind, ledgerViolations, NO_VIOLATIONS } from './support/ledger.js';
import { call, createPlayer, key, moveTo, nextIp, ok, refused, signUp, uniqueHandle } from './support/players.js';

let e2e: E2eApp;

beforeAll(async () => {
  e2e = await bootApp();
});

afterAll(async () => {
  if (e2e) expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  await e2e?.close();
});

const characterBody = (handle: string) => ({
  firstName: 'Tolu',
  lastName: 'Bakare',
  handle,
  gender: 'male',
  stateOfOrigin: 'oyo',
  appearance: { bodyType: 'slim', height: 1.02, skinTone: 2, hairStyle: 'fade', hairColor: 1, facialHair: 'stubble', eyeStyle: 'almond' },
});

describe('starting money', () => {
  it('gives every new character their family money plus the ₦4,000,000 starter fund, in the ledger and the snapshot', async () => {
    const players = await Promise.all(Array.from({ length: 10 }, () => createPlayer(e2e)));
    const seen = new Set<BackgroundId>();
    for (const player of players) {
      const snapshot = await player.snapshot();
      const background = snapshot.character.background;
      seen.add(background);
      const expected = BACKGROUNDS[background].startingCash + STARTER_FUND;
      expect(STARTER_FUND).toBe(4_000_000);
      expect(snapshot.wallet.balance).toBe(expected);
      expect(await player.cash()).toBe(expected);

      // Exactly two postings created the money: the family's opening balance and Uncle Tunde's starter fund.
      const flows = await cashFlowsByKind(e2e.dataSource, player.characterId);
      expect(flows).toEqual({ 'opening-balance': BACKGROUNDS[background].startingCash, gift: STARTER_FUND });

      // All of it is unearned and locked: it can be spent in Lagos but never sent to another player.
      const row = await player.character();
      expect(row.earned_total).toBe(0);
      expect(row.purchased_total).toBe(0);
      expect(row.locked_unearned).toBeGreaterThanOrEqual(expected);
      expect(row.unearned_total).toBe(row.locked_unearned);

      const wallet = ok<{ sendable: number; transferTier: number }>(await player.get('/wallet'));
      expect(wallet.sendable).toBe(0);
      expect(wallet.transferTier).toBe(1);
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('never lets starting money reach another player: transfers and sprays are refused and nothing moves', async () => {
    const sender = await createPlayer(e2e, { age: 22 });
    const recipient = await createPlayer(e2e, { age: 22 });
    const [senderBefore, recipientBefore] = [await sender.cash(), await recipient.cash()];

    refused(await sender.post('/transfers', { toHandle: recipient.handle, amount: 100_000, idempotencyKey: key() }), 422, 'STARTER_MONEY_LOCKED');
    refused(await sender.post('/transfers', { toHandle: `@${recipient.handle}`, amount: 100, idempotencyKey: key() }), 422, 'STARTER_MONEY_LOCKED');

    // In a bar (open 12:00-02:00), spraying the other player is a transfer too; spraying the DJ is spending.
    e2e.clock.at(15);
    await moveTo(sender, 'yaba-left-joint');
    await moveTo(recipient, 'yaba-left-joint');
    refused(await sender.post('/venues/yaba-left-joint/sprays', { toHandle: recipient.handle, amount: 1_000, idempotencyKey: key() }), 422, 'STARTER_MONEY_LOCKED');
    expect(await sender.cash()).toBe(senderBefore);
    expect(await recipient.cash()).toBe(recipientBefore);

    const dj = ok<{ amount: number }>(await sender.post('/venues/yaba-left-joint/sprays', { toHandle: null, amount: 1_000, idempotencyKey: key() }));
    expect(dj.amount).toBe(1_000);
    expect(await sender.cash()).toBe(senderBefore - 1_000);
    expect(await recipient.cash()).toBe(recipientBefore);

    const moved = await e2e.dataSource.query<unknown[]>(
      `SELECT 1 FROM ledger_transactions WHERE character_id = $1 AND counterparty_character_id = $2`,
      [sender.characterId, recipient.characterId],
    );
    expect(moved).toHaveLength(0);
    const counted = await e2e.dataSource.query<unknown[]>(`SELECT 1 FROM peer_money_days WHERE character_id IN ($1, $2)`, [sender.characterId, recipient.characterId]);
    expect(counted).toHaveLength(0);
  });
});

describe('accounts and characters', () => {
  it('allows one living character per account and unique handles', async () => {
    const player = await createPlayer(e2e);
    refused(await player.post('/characters', characterBody(uniqueHandle())), 409, 'CHARACTER_EXISTS');
    const other = await signUp(e2e);
    refused(await other.post('/characters', characterBody(player.handle)), 409, 'HANDLE_TAKEN');
  });

  it('rate-limits character creation per IP (5 a minute) without slowing other players down', async () => {
    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const account = await signUp(e2e);
      const response = await call(e2e, 'post', '/characters', ip).set('Authorization', `Bearer ${account.token}`).send(characterBody(uniqueHandle()));
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
    // Someone on another connection is unaffected.
    expect((await createPlayer(e2e)).characterId).toBeTruthy();
  });

  it('rate-limits sign-ups per IP (8 a minute)', async () => {
    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 9; i++) {
      const response = await call(e2e, 'post', '/auth/register', ip).send({ email: `${uniqueHandle('r')}@e2e.test`, password: 'Passw0rd-e2e', birthDate: '1999-01-01' });
      statuses.push(response.status);
    }
    expect(statuses.filter((status) => status === 201)).toHaveLength(8);
    expect(statuses[8]).toBe(429);
  });
});
