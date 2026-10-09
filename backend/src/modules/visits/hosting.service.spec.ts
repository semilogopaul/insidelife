import {
  HOSTING_RULES,
  MINUTES_PER_DAY,
  findHostTreat,
  homeLocationId,
  type Needs,
} from '@insidelife/shared';
import { FindOperator } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { DomainException } from '../../common/exceptions/domain.exception.js';
import type { FamilyPort } from '../../common/ports/family.port.js';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { RealtimeBus } from '../realtime-bus/realtime-bus.service.js';
import type { CharacterSession } from '../simulation/character-session.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { HomeTreatEntity } from './entities/home-treat.entity.js';
import { HomeVisitEntity } from './entities/home-visit.entity.js';
import { HostingService } from './hosting.service.js';

const NOW = 40 * MINUTES_PER_DAY + 18 * 60;
const YEAR = 360 * MINUTES_PER_DAY;
const PRICE_INDEX = 1.2;

type Row = Record<string, unknown>;

/** Just enough of TypeORM's operators for these queries. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (!(expected instanceof FindOperator)) return actual === expected;
    const value = expected.value as unknown;
    switch (expected.type) {
      case 'isNull':
        return actual === null || actual === undefined;
      case 'moreThan':
        return (actual as number) > (value as number);
      case 'moreThanOrEqual':
        return actual !== null && (actual as number) >= (value as number);
      case 'in':
        return (value as unknown[]).includes(actual);
      default:
        throw new Error(`operator ${expected.type}`);
    }
  });
}

function character(id: string, overrides: Partial<CharacterEntity> = {}): CharacterEntity {
  return {
    id,
    handle: id,
    firstName: id[0]?.toUpperCase() + id.slice(1),
    lastName: 'Test',
    gender: 'female',
    appearance: {},
    outfit: {},
    locationId: homeLocationId(id),
    alive: true,
    bornAt: NOW - 25 * YEAR,
    needs: { energy: 60, hunger: 30, hygiene: 60, fun: 40, social: 30 } satisfies Needs,
    moodModifiers: [],
    pantryMeals: 0,
    status: 100,
    travel: null,
    ...overrides,
  } as unknown as CharacterEntity;
}

/** The service over an in-memory database of characters, visits and treats. */
function world() {
  const tables = new Map<unknown, Row[]>([
    [HomeTreatEntity, []],
    [HomeVisitEntity, []],
  ]);
  const characters = new Map<string, CharacterEntity>();
  const payments: Array<{ amount: number; key: string }> = [];
  const notified: Array<{ to: string; title: string }> = [];
  const closeness: Array<{ who: string; other: string; delta: number }> = [];
  const settled: string[] = [];
  let ids = 0;

  const tableOf = (entity: unknown): Row[] => {
    if (entity === HomeTreatEntity || entity === HomeVisitEntity) return tables.get(entity) ?? [];
    return [...characters.values()] as unknown as Row[];
  };
  const manager = {
    find: async (entity: unknown, options: { where: Row; take?: number }) =>
      tableOf(entity)
        .filter((row) => matches(row, options.where))
        .slice(0, options.take ?? 1000),
    findOne: async (entity: unknown, options: { where: Row }) =>
      tableOf(entity).find((row) => matches(row, options.where)) ?? null,
    create: (_entity: unknown, values: Row) => ({ ...values }),
    save: async (rows: Row | Row[]) => {
      const list = Array.isArray(rows) ? rows : [rows];
      for (const row of list) {
        if (!row.id) {
          row.id = `treat-${++ids}`;
          tables.get(HomeTreatEntity)?.push(row);
        }
      }
      return rows;
    },
  };

  const session = {
    settleInBackground: async (id: string) => void settled.push(id),
  } as unknown as CharacterSession;
  const notifications = {
    create: async (_manager: unknown, to: string, drafts: Array<{ title: string }>) => {
      for (const draft of drafts) notified.push({ to, title: draft.title });
      return [];
    },
    push: () => undefined,
  } as unknown as NotificationsService;
  const bus = { toCharacter: () => undefined } as unknown as RealtimeBus;
  const family: FamilyPort = {
    snapshot: async () => ({ members: [], relationship: 'single', partner: null, children: [] }),
    adjustCloseness: async (ctx, other, delta) =>
      void closeness.push({ who: ctx.character.id, other, delta }),
    recordBirth: async () => undefined,
  };
  const service = new HostingService(session, notifications, bus, family);

  const ctxFor = (who: CharacterEntity, cash = 1_000_000) => {
    const hooks: Array<() => void> = [];
    let balance = cash;
    const ctx = {
      character: who,
      time: NOW,
      manager,
      world: { price: (base: number) => Math.round(base * PRICE_INDEX) },
      wallet: {
        get cash() {
          return balance;
        },
        pay: async (amount: number, _kind: string, _memo: string, key: string) => {
          balance -= amount;
          payments.push({ amount, key });
        },
      },
      afterCommit: (hook: () => void) => void hooks.push(hook),
    } as unknown as SimulationContext;
    return { ctx, commit: () => hooks.splice(0).forEach((hook) => hook()) };
  };

  const host = character('ada');
  characters.set(host.id, host);
  const addGuest = (id: string, overrides: Partial<CharacterEntity> = {}): CharacterEntity => {
    const guest = character(id, { locationId: homeLocationId(host.id), ...overrides });
    characters.set(id, guest);
    tables
      .get(HomeVisitEntity)
      ?.push({
        id: `visit-${id}`,
        hostId: host.id,
        guestId: id,
        status: 'accepted',
        expiresAt: NOW + MINUTES_PER_DAY,
      });
    return guest;
  };
  return {
    service,
    host,
    addGuest,
    ctxFor,
    payments,
    notified,
    closeness,
    settled,
    treats: () => tables.get(HomeTreatEntity) ?? [],
  };
}

const code = async (promise: Promise<unknown>): Promise<string | null> => {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof DomainException) return error.errorCode;
    throw error;
  }
};

describe('HostingService', () => {
  it('charges the host for everyone at today’s price and writes one pending row per guest', async () => {
    const w = world();
    w.addGuest('tolu');
    w.addGuest('kemi');
    const { ctx, commit } = w.ctxFor(w.host);
    const result = await w.service.serve(ctx, { treatId: 'suya-platter', idempotencyKey: 'order-0001' });
    const unit = Math.round((findHostTreat('suya-platter')?.price ?? 0) * PRICE_INDEX);
    expect(result.total).toBe(unit * 3);
    expect(w.payments).toEqual([{ amount: unit * 3, key: 'visit-treat:order-0001' }]);
    expect(w.treats().map((row) => [row.guestId, row.appliedAt])).toEqual([
      ['tolu', null],
      ['kemi', null],
    ]);
    // The host ate too, feels like a good host and gains a little clout.
    expect(w.host.needs.hunger).toBeGreaterThan(30);
    expect(w.host.moodModifiers.map((modifier) => modifier.id)).toContain('hosting');
    expect(result.cloutGained).toBe(1);
    expect(w.host.status).toBe(101);
    // Guests are told, and nudged to feel it in their own session after commit.
    expect(w.notified.map((note) => note.to)).toEqual(['tolu', 'kemi']);
    expect(w.notified[0]?.title).toBe('Ada ordered suya for you 🍢');
    expect(w.settled).toEqual([]);
    commit();
    expect(w.settled).toEqual(['tolu', 'kemi']);
  });

  it('never charges twice for a retried order', async () => {
    const w = world();
    w.addGuest('tolu');
    const { ctx } = w.ctxFor(w.host);
    await w.service.serve(ctx, { treatId: 'pizza', idempotencyKey: 'order-0002' });
    const again = await w.service.serve(ctx, { treatId: 'pizza', idempotencyKey: 'order-0002' });
    expect(again.replayed).toBe(true);
    expect(w.payments).toHaveLength(1);
    expect(w.treats()).toHaveLength(1);
    expect(await code(w.service.serve(ctx, { treatId: 'cake', idempotencyKey: 'order-0002' }))).toBe(
      'IDEMPOTENCY_KEY_REUSED',
    );
  });

  it('cooks from the pantry without money', async () => {
    const w = world();
    w.addGuest('tolu');
    w.host.pantryMeals = 5;
    const { ctx } = w.ctxFor(w.host, 0);
    await w.service.serve(ctx, { treatId: 'home-cooked', idempotencyKey: 'order-0003' });
    expect(w.payments).toEqual([]);
    expect(w.host.pantryMeals).toBe(3);
  });

  it('refuses alcohol with an under-18 inside, and anything when nobody’s in or you’re out', async () => {
    const w = world();
    w.addGuest('tunde', { bornAt: NOW - 17 * YEAR });
    const { ctx } = w.ctxFor(w.host);
    expect(await code(w.service.serve(ctx, { treatId: 'beer', idempotencyKey: 'order-0004' }))).toBe(
      'UNDER_18_GUEST',
    );
    expect(
      await code(w.service.serve(ctx, { treatId: 'soft-drinks', idempotencyKey: 'order-0005' })),
    ).toBeNull();
    // Still on the table.
    expect(await code(w.service.serve(ctx, { treatId: 'soft-drinks', idempotencyKey: 'order-0006' }))).toBe(
      'STILL_ON_TABLE',
    );
    w.host.locationId = 'lekki-mall';
    expect(await code(w.service.serve(ctx, { treatId: 'cake', idempotencyKey: 'order-0007' }))).toBe(
      'NOT_HOME',
    );
    const empty = world();
    expect(
      await code(
        empty.service.serve(empty.ctxFor(empty.host).ctx, { treatId: 'cake', idempotencyKey: 'order-0008' }),
      ),
    ).toBe('NO_GUESTS');
    expect(w.payments).toHaveLength(1);
  });

  it('lets the guest feel it once, in their own session, with closeness capped per day', async () => {
    const w = world();
    const tolu = w.addGuest('tolu');
    const host = w.ctxFor(w.host).ctx;
    await w.service.serve(host, { treatId: 'champagne', idempotencyKey: 'order-0009' });
    await w.service.serve(host, { treatId: 'cake', idempotencyKey: 'order-0010' });
    await w.service.serve(host, { treatId: 'goodie-bags', idempotencyKey: 'order-0011' });

    const guest = w.ctxFor(tolu).ctx;
    await w.service.applyPending(guest);
    expect(tolu.needs.hunger).toBe(45);
    expect(tolu.needs.social).toBeGreaterThan(30);
    expect(tolu.moodModifiers.map((modifier) => modifier.id)).toEqual(['treat:ada']);
    const gained = w.closeness
      .filter((entry) => entry.who === 'tolu')
      .reduce((sum, entry) => sum + entry.delta, 0);
    expect(gained).toBe(HOSTING_RULES.maxClosenessPerDay);
    expect(w.treats().every((row) => row.appliedAt === NOW)).toBe(true);

    // A second settle changes nothing.
    const before = { ...tolu.needs };
    await w.service.applyPending(guest);
    expect(tolu.needs).toEqual(before);
  });

  it('takes a guest’s thanks once and tells the host', async () => {
    const w = world();
    const tolu = w.addGuest('tolu');
    await w.service.serve(w.ctxFor(w.host).ctx, { treatId: 'jollof-chicken', idempotencyKey: 'order-0012' });
    const guest = w.ctxFor(tolu).ctx;
    await w.service.thank(guest, 'visit-tolu');
    expect(w.notified.at(-1)).toEqual({ to: 'ada', title: '@tolu says thank you 🙏' });
    expect(await code(w.service.thank(guest, 'visit-tolu'))).toBe('NOTHING_TO_THANK');
  });

  it('prices the menu for who’s inside and shows what’s on the table', async () => {
    const w = world();
    w.addGuest('tolu', { bornAt: NOW - 16 * YEAR });
    const { ctx } = w.ctxFor(w.host);
    await w.service.serve(ctx, { treatId: 'pizza', idempotencyKey: 'order-0013' });
    const view = await w.service.view(ctx);
    expect(view.guests.map((guest) => [guest.person.handle, guest.adult])).toEqual([['tolu', false]]);
    expect(view.active.map((treat) => treat.treatId)).toEqual(['pizza']);
    const menu = new Map(view.menu.map((offer) => [offer.id, offer]));
    expect(menu.get('cake')?.total).toBe(Math.round(38_000 * PRICE_INDEX));
    expect(menu.get('beer')?.unavailable).toMatch(/under-18/);
    expect(menu.get('pizza')?.unavailable).toMatch(/still on the table/i);
    expect(menu.get('soft-drinks')?.unavailable).toBeNull();
  });
});
