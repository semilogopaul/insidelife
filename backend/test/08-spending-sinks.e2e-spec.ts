import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HostingDto, HostingResultDto, NightOutDto, NightOutResultDto, VisitDto, VisitsDto } from '@insidelife/shared';
import { bootApp, type E2eApp } from './support/app.js';
import { burst, waitFor } from './support/game.js';
import { ledgerViolations, NO_VIOLATIONS } from './support/ledger.js';
import { createPlayer, goHome, key, moveTo, ok, refused, type Player } from './support/players.js';

let e2e: E2eApp;
const BAR = 'yaba-left-joint';

beforeAll(async () => {
  e2e = await bootApp();
});

afterAll(async () => {
  if (e2e) expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  await e2e?.close();
});

/** Set needs directly (test setup) so a boost applied twice would show. The clock is pinned: nothing drifts. */
async function setNeeds(player: Player, needs: Record<string, number>): Promise<void> {
  await e2e.dataSource.query(`UPDATE characters SET needs = needs || $1::jsonb WHERE id = $2`, [JSON.stringify(needs), player.characterId]);
}

interface Leg {
  readonly code: string | null;
  readonly owner_id: string | null;
  readonly amount: number;
  readonly counterparty: string | null;
}

/** The ledger posting behind a purchase: where the money went (players never receive spending). */
async function postingLegs(characterId: string, keySuffix: string): Promise<Leg[]> {
  const rows = await e2e.dataSource.query<Array<Omit<Leg, 'amount'> & { amount: string }>>(
    `SELECT a.code, a.owner_id, e.amount, t.counterparty_character_id AS counterparty
       FROM ledger_transactions t JOIN ledger_entries e ON e.transaction_id = t.id JOIN ledger_accounts a ON a.id = e.account_id
      WHERE t.idempotency_key = $1`,
    [`${characterId}:${keySuffix}`],
  );
  return rows.map((row) => ({ ...row, amount: Number(row.amount) }));
}

const buyMoment = (buyer: Player, body: Record<string, unknown>) => buyer.post(`/venues/${BAR}/moments`, body);

describe('club nights (bottles, shoutouts, tips)', () => {
  it('a bottle for someone in the room: charged once at the server’s price, money leaves the game, they feel it once', async () => {
    e2e.clock.at(18);
    const [buyer, friend] = [await createPlayer(e2e), await createPlayer(e2e)];
    await moveTo(buyer, BAR);
    await moveTo(friend, BAR);
    await setNeeds(friend, { social: 20, fun: 20 });
    const menu = ok<NightOutDto>(await buyer.get(`/venues/${BAR}/night-out`));
    const vodka = menu.offers.find((offer) => offer.id === 'premium-vodka')!;
    expect(vodka.unavailable).toBeNull();

    const before = await buyer.cash();
    const idempotencyKey = key();
    const order = { itemId: 'premium-vodka', toHandle: friend.handle, idempotencyKey };
    const bought = ok<NightOutResultDto>(await buyMoment(buyer, order));
    expect(bought).toMatchObject({ price: vodka.price, replayed: false });
    expect(await buyer.cash()).toBe(before - vodka.price);
    const legs = await postingLegs(buyer.characterId, `night-out:${idempotencyKey}`);
    expect(legs.map((leg) => [leg.code ?? 'buyer', leg.amount]).toSorted()).toEqual([['buyer', -vodka.price], ['system:burn', vodka.price]].toSorted());
    expect(legs.every((leg) => leg.counterparty === null)).toBe(true);

    // Retries with the same key (sequential and in parallel) charge nothing more.
    expect(ok<NightOutResultDto>(await buyMoment(buyer, order)).replayed).toBe(true);
    const parallel = await burst(4, () => buyMoment(buyer, order));
    expect(parallel.every((response) => response.status === 201 && response.body.replayed === true)).toBe(true);
    expect(await buyer.cash()).toBe(before - vodka.price);

    // The friend's own session applies it: once, however often they look.
    expect((await friend.snapshot()).character.needs).toMatchObject({ social: 28, fun: 26 });
    expect((await friend.character()).mood_modifiers.filter((modifier) => modifier.id === 'night-out:bottle')).toHaveLength(1);
    await friend.snapshot();
    expect((await friend.snapshot()).character.needs).toMatchObject({ social: 28, fun: 26 });
    const [row] = await e2e.dataSource.query<Array<{ recipient_applied: boolean }>>(`SELECT recipient_applied FROM social_night_moments WHERE from_id = $1 AND idempotency_key = $2`, [
      buyer.characterId,
      idempotencyKey,
    ]);
    expect(row?.recipient_applied).toBe(true);
  });

  it('a burst of different bottle orders is each charged once and the night’s caps hold', async () => {
    e2e.clock.at(18, 30);
    const [buyer, friend] = [await createPlayer(e2e), await createPlayer(e2e)];
    await moveTo(buyer, BAR);
    await moveTo(friend, BAR);
    const before = await buyer.cash();
    const results = await burst(5, () => buyMoment(buyer, { itemId: 'premium-vodka', toHandle: friend.handle, idempotencyKey: key() }));
    const paid = results.filter((response) => response.status === 201);
    // At most 3 bottles to the same person a night.
    expect(paid).toHaveLength(3);
    expect(results.filter((response) => response.status === 422)).toHaveLength(2);
    const spent = paid.reduce((sum, response) => sum + (response.body as NightOutResultDto).price, 0);
    expect(await buyer.cash()).toBe(before - spent);
  });

  it('refuses what the rules don’t allow, charging nothing; shoutouts and tips are spending, so starting money is fine', async () => {
    e2e.clock.at(19);
    const [buyer, absent] = [await createPlayer(e2e), await createPlayer(e2e)];
    await moveTo(buyer, BAR);
    const before = await buyer.cash();
    refused(await buyMoment(buyer, { itemId: 'premium-vodka', toHandle: absent.handle, idempotencyKey: key() }), 422);
    refused(await buyMoment(buyer, { itemId: 'shoutout-basic', message: 'Follow me on https://scam.ng', idempotencyKey: key() }), 422);
    refused(await buyMoment(buyer, { itemId: 'bottle-parade', toHandle: absent.handle, idempotencyKey: key() }), 422);
    expect(await buyer.cash()).toBe(before);

    const shoutout = ok<NightOutResultDto>(await buyMoment(buyer, { itemId: 'shoutout-basic', message: 'Happy birthday Tolu!', idempotencyKey: key() }));
    const tip = ok<NightOutResultDto>(await buyMoment(buyer, { itemId: 'tip-bartender', idempotencyKey: key() }));
    expect(await buyer.cash()).toBe(before - shoutout.price - tip.price);
  });
});

/** A host at home with two guests who accepted the invite and walked in. */
async function houseParty(): Promise<{ host: Player; guests: Player[] }> {
  e2e.clock.at(18);
  const host = await createPlayer(e2e);
  const guests = [await createPlayer(e2e), await createPlayer(e2e)];
  await goHome(host);
  for (const guest of guests) {
    const visit = ok<VisitDto>(await host.post('/visits', { handle: guest.handle }));
    ok(await guest.post(`/visits/${visit.id}/acceptance`));
    await moveTo(guest, `home:${host.characterId}`);
    await setNeeds(guest, { hunger: 20, social: 20, fun: 20 });
  }
  return { host, guests };
}

describe('hosting guests at home', () => {
  it('the host pays for every serving once; each guest feels the treat exactly once, in their own session', async () => {
    const { host, guests } = await houseParty();
    const view = ok<HostingDto>(await host.get('/visits/hosting'));
    expect(view.guests).toHaveLength(2);
    const suya = view.menu.find((offer) => offer.id === 'suya-platter')!;
    expect(suya).toMatchObject({ servings: 3, total: suya.unitPrice * 3, unavailable: null });

    const before = await host.cash();
    const idempotencyKey = key();
    const served = ok<HostingResultDto>(await host.post('/visits/treats', { treatId: 'suya-platter', idempotencyKey }));
    expect(served).toMatchObject({ total: suya.total, guests: 2, replayed: false });
    expect(await host.cash()).toBe(before - suya.total);
    const legs = await postingLegs(host.characterId, `visit-treat:${idempotencyKey}`);
    expect(legs.every((leg) => leg.owner_id === host.characterId || leg.code === 'system:burn')).toBe(true);

    // Replays charge nothing; the same treat can't be served again while it's on the table.
    expect(ok<HostingResultDto>(await host.post('/visits/treats', { treatId: 'suya-platter', idempotencyKey })).replayed).toBe(true);
    refused(await host.post('/visits/treats', { treatId: 'suya-platter', idempotencyKey: key() }), 422);
    expect(await host.cash()).toBe(before - suya.total);

    // Each guest's own session applies it, once: their client refetches on `character:invalidate`, even inside the
    // same game minute as the order.
    for (const guest of guests) {
      expect((await guest.snapshot()).character.needs).toMatchObject({ hunger: 60, social: 30, fun: 28 });
      expect((await guest.snapshot()).character.needs).toMatchObject({ hunger: 60, social: 30, fun: 28 });
      expect((await guest.character()).mood_modifiers.filter((modifier) => modifier.id === `treat:${host.characterId}`)).toHaveLength(1);
    }
    const applied = await e2e.dataSource.query<Array<{ applied_at: string | null }>>(`SELECT applied_at FROM home_treats WHERE host_id = $1`, [host.characterId]);
    expect(applied.map((row) => row.applied_at === null)).toEqual([false, false]);

    // A minute later, the host's background nudge applies the next treat without the guests doing anything.
    e2e.clock.advance(1);
    ok(await host.post('/visits/treats', { treatId: 'soft-drinks', idempotencyKey: key() }));
    await waitFor(async () => {
      const rows = await e2e.dataSource.query<Array<{ applied_at: string | null }>>(`SELECT applied_at FROM home_treats WHERE host_id = $1 AND treat_id = 'soft-drinks'`, [host.characterId]);
      return rows.length === 2 && rows.every((row) => row.applied_at !== null);
    }, 'guests to feel the drinks');
  });

  it('per-guest treats are charged per guest, a parallel burst of one order charges once, and thanks are free', async () => {
    const { host, guests } = await houseParty();
    const before = await host.cash();
    const idempotencyKey = key();
    const results = await burst(4, () => host.post('/visits/treats', { treatId: 'take-home-packs', idempotencyKey }));
    expect(results.every((response) => response.status === 201)).toBe(true);
    const charged = results.filter((response) => (response.body as HostingResultDto).replayed === false);
    expect(charged).toHaveLength(1);
    const total = (charged[0]!.body as HostingResultDto).total;
    expect(await host.cash()).toBe(before - total);
    const view = ok<HostingDto>(await host.get('/visits/hosting'));
    expect(total).toBe(view.menu.find((offer) => offer.id === 'take-home-packs')!.unitPrice * 2);

    const guest = guests[0]!;
    const visit = ok<VisitsDto>(await guest.get('/visits')).incoming.find((candidate) => candidate.host.id === host.characterId)!;
    const guestCash = await guest.cash();
    expect((await guest.post(`/visits/${visit.id}/thanks`)).status).toBe(204);
    refused(await guest.post(`/visits/${visit.id}/thanks`), 422, 'NOTHING_TO_THANK');
    expect(await guest.cash()).toBe(guestCash);
  });
});
