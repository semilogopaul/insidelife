import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNT_DELETION_PHRASE, REALTIME_NAMESPACE } from '@insidelife/shared';
import { grantAdmin, signInOwner, type Admin } from './support/admin.js';
import { bootApp, type E2eApp } from './support/app.js';
import { burst, fund, waitFor } from './support/game.js';
import { ledgerViolations, NO_VIOLATIONS } from './support/ledger.js';
import { createPlayer, key, moveTo, ok, refresh, refused, signIn, type Player } from './support/players.js';

let e2e: E2eApp;
let owner: Admin;
let admin: Admin;
const sockets: Socket[] = [];

beforeAll(async () => {
  e2e = await bootApp();
  owner = await signInOwner(e2e);
  admin = await grantAdmin(e2e, owner, 'support-admin@e2e.test');
});

afterAll(async () => {
  for (const socket of sockets) socket.disconnect();
  if (e2e) expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  await e2e?.close();
});

interface Adjusted {
  readonly applied: boolean;
  readonly amount: number;
  readonly cashAfter: number;
}

const adjust = (by: Admin, player: Player, amount: number, idempotencyKey: string = randomUUID()) =>
  by.post(`/players/${player.userId}/wallet-adjustments`, { amount, reason: 'Compensation for an outage', idempotencyKey });

async function auditCount(action: string, targetId: string): Promise<number> {
  const page = ok<{ total: number }>(await owner.get(`/audit-logs?action=${action}&targetId=${targetId}`));
  return page.total;
}

describe('wallet adjustments', () => {
  it('admins credit up to ₦10m at a time and ₦50m a day; owners have no cap; every change is audited', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    refused(await adjust(admin, player, 10_000_001), 403);
    for (let i = 0; i < 5; i++) expect(ok<Adjusted>(await adjust(admin, player, 10_000_000)).applied).toBe(true);
    const capped = await adjust(admin, player, 1);
    refused(capped, 403);
    expect(capped.body.message).toMatch(/₦50,000,000 a day/);
    expect(ok<Adjusted>(await adjust(owner, player, 20_000_000)).applied).toBe(true);
    expect(await player.cash()).toBe(before + 70_000_000);
    expect(await auditCount('wallet.adjust', player.userId)).toBe(6);
    // Support credits are unearned (never on the self-made rich list).
    expect((await player.character()).earned_total).toBe(0);
  });

  it('parallel credits by one admin can’t pass the daily cap together', async () => {
    const helper = await grantAdmin(e2e, owner, `cap-race-${randomUUID().slice(0, 6)}@e2e.test`);
    const players = await Promise.all(Array.from({ length: 7 }, () => createPlayer(e2e)));
    const results = await Promise.all(players.map((player) => adjust(helper, player, 10_000_000)));
    expect(results.filter((response) => response.status === 200)).toHaveLength(5);
    expect(results.filter((response) => response.status === 403)).toHaveLength(2);
  });

  it('applies a retried adjustment once, refuses debits below zero, and players can’t call it', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const idempotencyKey = randomUUID();
    const results = await burst(4, () => adjust(owner, player, 250_000, idempotencyKey));
    expect(results.filter((response) => response.body.applied === true)).toHaveLength(1);
    expect(results.filter((response) => response.body.applied === false)).toHaveLength(3);
    expect(await player.cash()).toBe(before + 250_000);

    refused(await adjust(owner, player, -(before + 250_001)), 422, 'INSUFFICIENT_FUNDS');
    expect(ok<Adjusted>(await adjust(owner, player, -50_000)).cashAfter).toBe(before + 200_000);
    expect(await player.cash()).toBe(before + 200_000);
    refused(await player.post(`/admin/players/${player.userId}/wallet-adjustments`, { amount: 1, reason: 'I want money', idempotencyKey: randomUUID() }), 401);
  });
});

function connect(player: Player): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`${e2e.baseUrl}${REALTIME_NAMESPACE}`, { auth: { token: player.token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(socket);
    const timer = setTimeout(() => reject(new Error('socket handshake timed out')), 5_000);
    socket.once('world:instance', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('disconnect', () => {
      clearTimeout(timer);
      reject(new Error('refused'));
    });
  });
}

/** The next event of this name on the socket (or fail after a few seconds). */
function next<T>(socket: Socket, event: string, matches: (payload: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${event} event`)), 5_000);
    const listener = (payload: T): void => {
      if (!matches(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });
}

describe('the open game hears about money at once (realtime)', () => {
  it('a transfer and a top-up push a notification and a refetch to the player’s sockets', async () => {
    const recipient = await createPlayer(e2e);
    const payer = await createPlayer(e2e);
    await fund(e2e, payer, 500_000);
    const socket = await connect(recipient);

    const notified = next<{ kind: string; amount?: number }>(socket, 'notification', (payload) => payload.kind === 'money-received');
    const invalidated = next<{ reason: string }>(socket, 'character:invalidate', (payload) => payload.reason === 'transfer-received');
    ok(await payer.post('/transfers', { toHandle: recipient.handle, amount: 25_000, idempotencyKey: key() }));
    expect(await notified).toMatchObject({ kind: 'money-received', amount: 25_000 });
    await invalidated;

    const credited = next<{ title: string; amount?: number }>(socket, 'notification', (payload) => payload.title === 'Payment confirmed ✓');
    const started = ok<{ reference: string }>(await recipient.post('/payments/topups', { packageId: 'small-chops' }));
    ok(await recipient.post(`/payments/sandbox/${started.reference}/succeed`));
    expect(await credited).toMatchObject({ amount: 150_000 });
    socket.disconnect();
  });
});

describe('suspending and deleting accounts', () => {
  it('suspension ends sessions at once: tokens, refresh, sign-in and open sockets', async () => {
    const player = await createPlayer(e2e);
    const socket = await connect(player);
    const closed = new Promise<string>((resolve) => socket.once('disconnect', resolve));

    ok(await owner.post(`/players/${player.userId}/suspend`, { reason: 'Chargeback fraud' }));
    expect(await closed).toBe('io server disconnect');
    refused(await player.get('/characters/me'), 401);
    refused(await refresh(player), 401);
    refused(await signIn(player), 403, 'ACCOUNT_SUSPENDED');
    await expect(connect(player)).rejects.toThrow('refused');
    expect(await auditCount('player.suspend', player.userId)).toBe(1);

    ok(await owner.post(`/players/${player.userId}/unsuspend`, { reason: 'Bank confirmed it was a mistake' }));
    await waitFor(async () => (await signIn(player)).status === 200, 'sign-in after the suspension is lifted', 5_000);
    ok(await player.get('/characters/me'));
  });

  it('a deleted account can’t sign in or be paid, sprayed or found; restoring brings it back', async () => {
    e2e.clock.at(16);
    const player = await createPlayer(e2e);
    const payer = await createPlayer(e2e);
    await fund(e2e, payer, 1_000_000);
    await moveTo(player, 'yaba-left-joint');
    await moveTo(payer, 'yaba-left-joint');

    ok(await admin.post(`/players/${player.userId}/delete`, { reason: 'Asked us to delete it' }));
    refused(await signIn(player), 403, 'ACCOUNT_DELETED');
    refused(await player.get('/characters/me'), 401);
    const cash = await player.cash();
    refused(await payer.post('/transfers', { toHandle: player.handle, amount: 1_000, idempotencyKey: key() }), 404);
    refused(await payer.post('/venues/yaba-left-joint/sprays', { toHandle: player.handle, amount: 1_000, idempotencyKey: key() }), 404);
    refused(await payer.get(`/characters/${player.handle}`), 404);
    expect(await player.cash()).toBe(cash);

    ok(await admin.post(`/players/${player.userId}/restore`, { reason: 'Changed their mind' }));
    await waitFor(async () => (await signIn(player)).status === 200, 'sign-in after restore', 5_000);
    ok(await payer.post('/transfers', { toHandle: player.handle, amount: 1_000, idempotencyKey: key() }));
    expect(await player.cash()).toBe(cash + 1_000);
  });

  it('players can delete their own account; admins can’t touch an owner', async () => {
    const player = await createPlayer(e2e);
    refused(await player.post('/account/deletion', { password: 'wrong-password-1', confirmation: ACCOUNT_DELETION_PHRASE }), 422, 'PASSWORD_INCORRECT');
    expect((await player.post('/account/deletion', { password: player.password, confirmation: ACCOUNT_DELETION_PHRASE })).status).toBeLessThan(300);
    refused(await signIn(player), 403, 'ACCOUNT_DELETED');
    refused(await admin.post(`/players/${owner.account.userId}/suspend`, { reason: 'Trying my luck' }), 403);
  });
});
