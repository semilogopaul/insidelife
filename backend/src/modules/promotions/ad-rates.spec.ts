import type { Redis } from 'ioredis';
import type { Repository } from 'typeorm';
import { AD_RATE_KEYS, AD_SLOTS, findAdSlot } from '@insidelife/shared';
import { AD_RATES_CHANNEL, AdRatesService } from './ad-rates.service.js';
import { AdRateEntity } from './entities/ad-rate.entity.js';

const NAIRA = 100;
const ADMIN = '9f0c3a52-1b2d-4e5f-8a9b-0c1d2e3f4a5b';

/** One `ad_rates` table shared by every "node". */
class FakeTable {
  readonly rows = new Map<string, AdRateEntity>();
  reads = 0;
  readonly repository = {
    find: async () => {
      this.reads += 1;
      return [...this.rows.values()].map((row) => Object.assign(new AdRateEntity(), row));
    },
    create: (fields: Partial<AdRateEntity>) => Object.assign(new AdRateEntity(), fields),
    save: async (row: AdRateEntity) => {
      const saved = Object.assign(new AdRateEntity(), row, { updatedAt: new Date('2026-10-09T10:00:00Z') });
      this.rows.set(row.key, saved);
      return saved;
    },
    delete: async (where: { key: string }) => void this.rows.delete(where.key),
  } as unknown as Repository<AdRateEntity>;
}

/** Redis pub/sub between nodes, in memory. */
class FakeBus {
  readonly subscribers = new Set<FakeSubscriber>();
  readonly published: string[] = [];

  client(): Redis {
    return {
      duplicate: () => new FakeSubscriber(this),
      publish: async (channel: string) => {
        this.published.push(channel);
        for (const subscriber of this.subscribers) subscriber.deliver(channel);
        return this.subscribers.size;
      },
    } as unknown as Redis;
  }
}

class FakeSubscriber {
  private readonly channels = new Set<string>();
  private readonly handlers: Array<(channel: string, message: string) => void> = [];

  constructor(private readonly bus: FakeBus) {}

  on(event: string, handler: (channel: string, message: string) => void): this {
    if (event === 'message') this.handlers.push(handler);
    return this;
  }

  async subscribe(channel: string): Promise<number> {
    this.channels.add(channel);
    this.bus.subscribers.add(this);
    return 1;
  }

  async quit(): Promise<'OK'> {
    this.bus.subscribers.delete(this);
    return 'OK';
  }

  deliver(channel: string): void {
    if (this.channels.has(channel)) for (const handler of this.handlers) handler(channel, '1');
  }
}

async function node(table: FakeTable, bus: FakeBus): Promise<AdRatesService> {
  const service = new AdRatesService(table.repository, bus.client());
  await service.onModuleInit();
  return service;
}

const lagosTv = findAdSlot('lagos-tv')!;

describe('AdRatesService', () => {
  it('uses the catalog defaults until a rate is overridden', async () => {
    const rates = await node(new FakeTable(), new FakeBus());
    const list = await rates.list();
    expect(list.map((rate) => rate.key)).toEqual([...AD_RATE_KEYS]);
    expect(list.find((rate) => rate.key === 'phone-app')).toEqual({
      key: 'phone-app',
      label: 'Sponsored phone apps',
      unit: 'week',
      byDistrict: false,
      defaultKobo: 100_000 * NAIRA,
      currentKobo: 100_000 * NAIRA,
      updatedAt: null,
      updatedBy: null,
    });
    expect(await rates.rateKobo('club-song')).toBe(5_000 * NAIRA);
    const pricing = await rates.pricing();
    expect(pricing.weekPriceKobo(lagosTv)).toBe(42_000 * NAIRA);
    expect(pricing.songPriceKobo).toBe(5_000 * NAIRA);
  });

  it('applies an override to new quotes, scaled per district for roadside kinds', async () => {
    const rates = await node(new FakeTable(), new FakeBus());
    const shelter = AD_SLOTS.find((slot) => slot.kind === 'bus-shelter')!;
    const before = (await rates.pricing()).weekPriceKobo(shelter);
    const dto = await rates.setRate('bus-shelter', 12_600 * NAIRA, ADMIN, 'Shelters are popular');
    expect(dto).toMatchObject({ key: 'bus-shelter', byDistrict: true, defaultKobo: 6_300 * NAIRA, currentKobo: 12_600 * NAIRA, updatedBy: ADMIN, updatedAt: '2026-10-09T10:00:00.000Z' });
    const after = (await rates.pricing()).weekPriceKobo(shelter);
    expect(after).toBeGreaterThan(before);
    expect(after % (500 * NAIRA)).toBe(0);
    await rates.setRate('lagos-tv', 50_000 * NAIRA, ADMIN);
    expect((await rates.pricing()).weekPriceKobo(lagosTv)).toBe(50_000 * NAIRA);
  });

  it('accepts only known keys and whole naira from ₦2,000 to ₦100m', async () => {
    const rates = await node(new FakeTable(), new FakeBus());
    await expect(rates.setRate('free-billboards', 5_000 * NAIRA, ADMIN)).rejects.toMatchObject({ errorCode: 'RESOURCE_NOT_FOUND' });
    for (const bad of [1_999 * NAIRA, 2_000 * NAIRA + 50, 100_000_001 * NAIRA, -5_000 * NAIRA, Number.NaN]) {
      await expect(rates.setRate('totem', bad, ADMIN), String(bad)).rejects.toMatchObject({ errorCode: 'INVALID_RATE' });
    }
    await expect(rates.setRate('totem', 2_000 * NAIRA, ADMIN)).resolves.toMatchObject({ currentKobo: 2_000 * NAIRA });
    await expect(rates.setRate('mmia-arrivals', 100_000_000 * NAIRA, ADMIN)).resolves.toMatchObject({ currentKobo: 100_000_000 * NAIRA });
  });

  it('tells every node within a moment (Redis pub/sub), not after the cache TTL', async () => {
    const table = new FakeTable();
    const bus = new FakeBus();
    const [first, second] = await Promise.all([node(table, bus), node(table, bus)]);
    const changes: string[] = [];
    second.onChange(() => changes.push('changed'));
    expect(await second.rateKobo('lagos-tv')).toBe(42_000 * NAIRA); // cached on the second node
    await first.setRate('lagos-tv', 60_000 * NAIRA, ADMIN);
    expect(bus.published).toEqual([AD_RATES_CHANNEL]);
    expect(changes).toEqual(['changed']);
    expect(await second.rateKobo('lagos-tv')).toBe(60_000 * NAIRA);
  });

  it('resets a rate to the catalog default', async () => {
    const rates = await node(new FakeTable(), new FakeBus());
    await rates.setRate('club-song', 7_500 * NAIRA, ADMIN);
    expect(await rates.rateKobo('club-song')).toBe(7_500 * NAIRA);
    expect(await rates.resetRate('club-song')).toMatchObject({ currentKobo: 5_000 * NAIRA, updatedAt: null });
    expect(await rates.rateKobo('club-song')).toBe(5_000 * NAIRA);
  });

  it('serves cached rates between changes (one table read per TTL)', async () => {
    const table = new FakeTable();
    const rates = await node(table, new FakeBus());
    await rates.rateKobo('totem');
    await rates.pricing();
    await rates.list();
    expect(table.reads).toBe(1);
    await rates.onModuleDestroy();
  });
});
