import type { DataSource } from 'typeorm';
import { MINUTES_PER_DAY, MINUTES_PER_YEAR } from '@insidelife/shared';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import type { WorldService } from '../world/world.service.js';
import { FobesSnapshotsService } from './fobes-snapshots.service.js';
import { FobesService } from './fobes.service.js';
import type { RankingCache } from './ranking-cache.service.js';

const NOW = 40 * MINUTES_PER_YEAR + 3 * MINUTES_PER_DAY + 600;
const TODAY = Math.floor(NOW / MINUTES_PER_DAY);

type Handler = (sql: string, params: readonly unknown[]) => unknown[] | undefined;

/** Answers raw SQL by the first handler that recognises it, and records every call. */
class FakeDataSource {
  readonly calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  constructor(private readonly handlers: Handler[]) {}
  async query(sql: string, params: readonly unknown[] = []): Promise<unknown[]> {
    this.calls.push({ sql, params });
    for (const handler of this.handlers) {
      const rows = handler(sql, params);
      if (rows) return rows;
    }
    return [];
  }
}

/** In-memory stand-in for Redis that counts loads. */
class MemoryCache {
  readonly loads: string[] = [];
  private readonly store = new Map<string, unknown>();
  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (this.store.has(key)) return JSON.parse(JSON.stringify(this.store.get(key))) as T;
    this.loads.push(key);
    const value = await load();
    this.store.set(key, value);
    return value;
  }
}

const sqlRow = (index: number, overrides: Record<string, unknown> = {}) => ({
  id: `id-${index}`,
  handle: `player${index}`,
  first_name: `First${index}`,
  last_name: `Last${index}`,
  born_at: String(NOW - 25 * MINUTES_PER_YEAR),
  status: 300,
  generation: 1,
  net_worth: String(1_000_000_000 - index * 1_000_000),
  unearned_total: '5000000',
  purchased_total: '0',
  title: 'Founder',
  show_exact_wealth: index % 2 === 0,
  value: String(1_000_000_000 - index * 1_000_000),
  rank: String(index),
  ...overrides,
});

const viewer = (overrides: Partial<CharacterEntity> = {}): CharacterEntity =>
  ({
    id: 'id-me',
    handle: 'me',
    bornAt: NOW - 24 * MINUTES_PER_YEAR,
    netWorth: 12_000_000,
    unearnedTotal: 5_000_000,
    purchasedTotal: 0,
    generation: 1,
    ...overrides,
  }) as CharacterEntity;

function setup(handlers: Handler[]) {
  const dataSource = new FakeDataSource(handlers);
  const cache = new MemoryCache();
  const world = { now: () => NOW } as unknown as WorldService;
  const snapshots = new FobesSnapshotsService(dataSource as unknown as DataSource, world);
  const service = new FobesService(dataSource as unknown as DataSource, cache as unknown as RankingCache, world, snapshots);
  return { service, dataSource, cache };
}

const ranked: Handler = (sql) => (sql.includes('WITH top AS') ? Array.from({ length: 100 }, (_, index) => sqlRow(index + 1)) : undefined);

describe('FobesService lists', () => {
  it('computes a list once per cache window and serves its pages from it, applying privacy per viewer', async () => {
    const { service, cache } = setup([ranked]);
    const first = await service.list('rich-list', 1, viewer({ id: 'id-3' }));
    const last = await service.list('rich-list', 5, null);

    expect(cache.loads).toEqual(['social:fobes:v1:list:rich-list']);
    expect(first).toMatchObject({ page: 1, pageSize: 20, totalPages: 5, total: 100, since: null });
    expect(first.entries).toHaveLength(20);
    expect(first.entries[0]).toMatchObject({ rank: 1, handle: 'player1', exact: false, worth: { exact: null, display: '₦500M+' } });
    expect(first.entries[1]).toMatchObject({ rank: 2, exact: true, worth: { exact: 998_000_000 } });
    // Your own row is exact even though you keep it private.
    expect(first.entries[2]).toMatchObject({ handle: 'player3', isYou: true, exact: true, worth: { exact: 997_000_000 } });
    expect(last.entries.map((entry) => entry.rank)).toEqual(Array.from({ length: 20 }, (_, index) => 81 + index));
  });

  it('only ranks the living and the visible, and under 30 by birth date', async () => {
    const { service, dataSource } = setup([ranked]);
    await service.list('under-30', 1, null);
    const call = dataSource.calls.find((entry) => entry.sql.includes('WITH top AS'));
    expect(call?.sql).toContain('c.alive AND c.hidden_at IS NULL');
    expect(call?.sql).toContain('c.born_at > $1');
    expect(call?.params).toEqual([NOW - 30 * MINUTES_PER_YEAR]);
  });

  it('lists risers against a week-old snapshot, with new entries and no naira for private players', async () => {
    const { service, dataSource } = setup([
      (sql) => (sql.includes('MIN(day) AS base') ? [{ base: TODAY - 7, latest: TODAY }] : undefined),
      (sql) =>
        sql.includes('WITH base AS')
          ? [
              sqlRow(1, { value: '900000000', before: '600000000', rank_before: 4, new_entry: false, show_exact_wealth: false }),
              sqlRow(2, { value: '700000000', before: '0', rank_before: null, new_entry: true }),
            ]
          : undefined,
    ]);
    const risers = await service.list('risers', 1, null);
    expect(risers.since).toBe((TODAY - 7) * MINUTES_PER_DAY);
    expect(risers.entries[0]?.move).toEqual({ change: null, pct: 50, display: '+50%', rankBefore: 4, newEntry: false });
    expect(risers.entries[1]?.move).toMatchObject({ display: 'New entry', newEntry: true });
    expect(dataSource.calls.find((entry) => entry.sql.includes('WITH base AS'))?.params).toEqual([TODAY - 7, TODAY]);

    await service.list('fallers', 1, null);
    const fallers = dataSource.calls.filter((entry) => entry.sql.includes('WITH base AS'))[1];
    expect(fallers?.sql).not.toContain('UNION ALL');
    expect(fallers?.sql).toContain('c.net_worth < m.before');
  });

  it('has no movers before the first snapshot', async () => {
    const { service } = setup([]);
    expect(await service.list('fallers', 1, null)).toMatchObject({ entries: [], total: 0, totalPages: 1, since: null });
  });
});

describe('FobesService me', () => {
  it('ranks you beyond the top 100 with the gap to #100 (banded when that player is private), and records your value', async () => {
    const { service, dataSource } = setup([
      (sql) => (sql.startsWith('SELECT show_exact_wealth') ? [{ show_exact_wealth: false }] : undefined),
      (sql) => (sql.startsWith('SELECT COUNT(*) AS n') ? [{ n: '2340' }] : undefined),
      (sql) => (sql.includes('OFFSET 99 LIMIT 1') ? [{ value: '1212000000', exact: false }] : undefined),
      (sql) => (sql.includes('FROM fobes_snapshots WHERE character_id') ? [{ day: TODAY - 7, net_worth: '10000000' }] : undefined),
    ]);
    const me = await service.me(viewer());

    expect(me.richList).toEqual({ list: 'rich-list', rank: 2341, inTop: false, worth: 12_000_000, next: { rank: 100, gap: { exact: null, display: '₦1B+' } } });
    expect(me.selfMadeList).toMatchObject({ rank: 2341, worth: 7_000_000 });
    expect(me.under30).toMatchObject({ list: 'under-30', rank: 2341 });
    expect(me.week).toEqual({ change: 2_000_000, pct: 20, since: (TODAY - 7) * MINUTES_PER_DAY });
    expect(me.showExactWealth).toBe(false);
    const record = dataSource.calls.find((entry) => entry.sql.startsWith('INSERT INTO fobes_snapshots'));
    expect(record?.sql).toContain('DO NOTHING');
    expect(record?.params).toEqual([TODAY, 'id-me', 12_000_000]);
  });

  it('inside the top 100 shows the exact gap to the next place when they show theirs; #1 has nobody to chase', async () => {
    const { service } = setup([
      (sql, params) => (sql.startsWith('SELECT COUNT(*) AS n') ? [{ n: params.at(-1) === 7_000_000 ? '0' : '41' }] : undefined),
      (sql) => (sql.includes('bool_and') ? [{ value: '13500000', exact: true, ties: '2' }] : undefined),
    ]);
    const me = await service.me(viewer({ bornAt: NOW - 31 * MINUTES_PER_YEAR }));
    expect(me.richList).toMatchObject({ rank: 42, inTop: true, next: { rank: 40, gap: { exact: 1_500_000, display: '₦1.5M' } } });
    expect(me.selfMadeList).toMatchObject({ rank: 1, inTop: true, next: null });
    expect(me.under30).toBeNull();
  });

  it('leaves you unranked with nothing to count', async () => {
    const { service, dataSource } = setup([]);
    const me = await service.me(viewer({ netWorth: 3_000_000, unearnedTotal: 5_000_000 }));
    expect(me.selfMadeList).toEqual({ list: 'self-made', rank: null, inTop: false, worth: 0, next: null });
    expect(dataSource.calls.filter((entry) => entry.sql.startsWith('SELECT COUNT(*)') && entry.sql.includes('GREATEST'))).toHaveLength(0);
  });
});
