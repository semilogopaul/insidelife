import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR, startOfDay, stayCheckoutAt } from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { HotelStayEntity } from './entities/hotel-stay.entity.js';
import { HotelsService } from './hotels.service.js';
import { HotelsSystem } from './hotels.system.js';

const DAY = startOfDay(80 * MINUTES_PER_DAY);
const EVENING = DAY + 19 * MINUTES_PER_HOUR;

/** The service over an in-memory stay table, a wallet that honours idempotency keys, and a character at a reception. */
function harness(options: { location?: string; cash?: number; cityId?: 'lagos' | 'abuja'; time?: number; homeDistrictId?: string } = {}) {
  const rows: HotelStayEntity[] = [];
  const paid = new Map<string, number>();
  const notes: string[] = [];
  const bodies: string[] = [];
  const wallet = {
    cash: options.cash ?? 5_000_000,
    canAfford: (amount: number) => wallet.cash >= amount,
    pay: async (amount: number, _kind: string, _memo: string, key: string) => {
      if (paid.has(key)) return false;
      paid.set(key, amount);
      wallet.cash -= amount;
      return true;
    },
  };
  const ctx = {
    time: options.time ?? EVENING,
    character: { id: 'c1', alive: true, locationId: options.location ?? 'transcorp-hilton', cityId: options.cityId ?? 'abuja', homeDistrictId: options.homeDistrictId ?? 'yaba', travel: null },
    world: { price: (base: number) => base },
    wallet,
    manager: {
      findOne: async () => rows.find((row) => row.status === 'active') ?? null,
      create: (_entity: unknown, data: Partial<HotelStayEntity>) => ({ ...data }) as HotelStayEntity,
      save: async (row: HotelStayEntity) => {
        if (!row.id) {
          row.id = `stay-${rows.length + 1}`;
          rows.push(row);
        }
        return row;
      },
    },
    memo: async (_key: string, load: () => Promise<unknown>) => load(),
    mayHaveRows: async () => true,
    invalidate: () => undefined,
    notify: (note: { title: string; body: string }) => void (notes.push(note.title), bodies.push(note.body)),
  } as unknown as SimulationContext;
  const service = new HotelsService();
  return { service, ctx, rows, paid, wallet, notes, bodies };
}

describe('booking a hotel room', () => {
  it('charges nights times the tier rate once, through the ledger, and checks out at noon', async () => {
    const { service, ctx, paid, wallet, rows } = harness();
    const result = await service.book(ctx, 'transcorp-hilton', 2);
    expect(result).toMatchObject({ nights: 2, price: 660_000, extended: false });
    expect(wallet.cash).toBe(5_000_000 - 660_000);
    expect([...paid.keys()]).toEqual(['hotel-stay:stay-1']);
    expect(rows[0]).toMatchObject({ venueId: 'transcorp-hilton', nights: 2, nightlyRate: 330_000, checkoutAt: stayCheckoutAt(EVENING, 2), status: 'active' });
    expect(result.stay.checkoutAt).toBe(DAY + 2 * MINUTES_PER_DAY + 12 * MINUTES_PER_HOUR);
  });

  it('prices by tier: a standard room costs less than a luxury one', async () => {
    const cheap = harness({ location: 'chelsea-hotel-abuja' });
    const grand = harness();
    expect((await cheap.service.book(cheap.ctx, 'chelsea-hotel-abuja', 1)).price).toBeLessThan((await grand.service.book(grand.ctx, 'transcorp-hilton', 1)).price);
  });

  it('only books at the reception of the hotel you are standing in', async () => {
    const { service, ctx } = harness({ location: 'wuse-market' });
    await expect(service.book(ctx, 'transcorp-hilton', 1)).rejects.toMatchObject({ errorCode: 'NOT_AT_RECEPTION' });
    ctx.character.locationId = 'transcorp-hilton';
    ctx.character.travel = {} as never;
    await expect(service.book(ctx, 'transcorp-hilton', 1)).rejects.toMatchObject({ errorCode: 'NOT_AT_RECEPTION' });
  });

  it('refuses an unknown hotel, a silly number of nights, and a guest who cannot pay (no charge)', async () => {
    const { service, ctx, paid, rows } = harness({ cash: 100_000 });
    await expect(service.book(ctx, 'yaba-market', 1)).rejects.toMatchObject({ errorCode: 'RESOURCE_NOT_FOUND' });
    await expect(service.book(ctx, 'transcorp-hilton', 0)).rejects.toMatchObject({ errorCode: 'BAD_NIGHTS' });
    await expect(service.book(ctx, 'transcorp-hilton', 30)).rejects.toMatchObject({ errorCode: 'BAD_NIGHTS' });
    await expect(service.book(ctx, 'transcorp-hilton', 1)).rejects.toMatchObject({ errorCode: 'INSUFFICIENT_FUNDS' });
    expect(paid.size).toBe(0);
    expect(rows).toHaveLength(0);
  });

  it('extends the stay at the same hotel, with its own ledger key, and refuses a second hotel', async () => {
    const { service, ctx, paid, rows } = harness();
    const first = await service.book(ctx, 'transcorp-hilton', 1);
    const second = await service.book(ctx, 'transcorp-hilton', 2);
    expect(second).toMatchObject({ extended: true, nights: 2 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ nights: 3, totalPaid: 990_000 });
    expect(second.stay.checkoutAt).toBe(first.stay.checkoutAt + 2 * MINUTES_PER_DAY);
    expect([...paid.keys()]).toHaveLength(2);
    ctx.character.locationId = 'sheraton-abuja';
    await expect(service.book(ctx, 'sheraton-abuja', 1)).rejects.toMatchObject({ errorCode: 'ALREADY_STAYING' });
  });
});

describe('a stay as a temporary home', () => {
  it('is the residence for the nights it covers and the snapshot summary says so, until checkout', async () => {
    const { service, ctx } = harness();
    const system = new HotelsSystem({ register: () => undefined } as never, service);
    const booked = await service.book(ctx, 'transcorp-hilton', 1);
    const offer = await system.residence(ctx, ctx.time);
    expect(offer).toMatchObject({ locationId: 'transcorp-hilton', cityId: 'abuja', districtId: 'maitama' });
    expect(offer?.priority).toBeGreaterThan(10);
    expect(await system.residence(ctx, booked.stay.checkoutAt)).toBeNull();
    expect(await service.summary(ctx)).toMatchObject({ venueId: 'transcorp-hilton', cityId: 'abuja', checkoutAt: booked.stay.checkoutAt });
  });

  it('gives you the hotel’s bed in your room, and the home’s bed elsewhere', async () => {
    const { service, ctx } = harness();
    const system = new HotelsSystem({ register: () => undefined } as never, service);
    await service.book(ctx, 'transcorp-hilton', 1);
    const base = { comfort: 50, bedQuality: 0.2, jobStress: 0, energyCap: 100 };
    expect((await system.profileContext(ctx, base)).bedQuality).toBeGreaterThan(0.9);
    ctx.character.locationId = 'wuse-market';
    expect((await system.profileContext(ctx, base)).bedQuality).toBe(0.2);
  });

  it('ends at checkout time on the next settle, once, and tells the guest', async () => {
    const { service, ctx, rows, notes } = harness();
    const booked = await service.book(ctx, 'transcorp-hilton', 1);
    await service.endDue(ctx);
    expect(rows[0]?.status).toBe('active');
    ctx.time = booked.stay.checkoutAt + 1;
    await service.endDue(ctx);
    expect(rows[0]).toMatchObject({ status: 'ended', checkoutAt: booked.stay.checkoutAt });
    expect(notes).toContain('Checkout time 🧳');
    await service.endDue(ctx);
    expect(notes.filter((note) => note === 'Checkout time 🧳')).toHaveLength(1);
    expect(await service.summary(ctx)).toBeNull();
  });

  it('checks out early without a refund', async () => {
    const { service, ctx, wallet, rows } = harness();
    await service.book(ctx, 'transcorp-hilton', 3);
    const cash = wallet.cash;
    const result = await service.checkout(ctx);
    expect(result.stay.status).toBe('ended');
    expect(rows[0]?.checkoutAt).toBe(ctx.time);
    expect(wallet.cash).toBe(cash);
    await expect(service.checkout(ctx)).rejects.toMatchObject({ errorCode: 'NO_STAY' });
  });
});

describe('hotels are for travellers with no home in the city', () => {
  const BEDTIME = DAY + 21 * MINUTES_PER_HOUR;

  it('points a traveller with no home here at the hotels, once, when bedtime comes', async () => {
    const { service, ctx, notes, bodies } = harness({ location: 'wuse-market' });
    await service.noteNoBed(ctx, BEDTIME - 30, BEDTIME + 30);
    expect(notes).toEqual(['Nowhere to sleep? 🛎️']);
    expect(bodies[0]).toContain('no home in Abuja');
    // The next stretch starts after bedtime: nothing more tonight.
    await service.noteNoBed(ctx, BEDTIME + 30, BEDTIME + 90);
    await service.noteNoBed(ctx, DAY + 10 * MINUTES_PER_HOUR, DAY + 12 * MINUTES_PER_HOUR);
    expect(notes).toHaveLength(1);
  });

  it('says nothing with a home in this city, with a room booked, or on the road', async () => {
    const home = harness({ location: 'wuse-market', homeDistrictId: 'wuse' });
    await home.service.noteNoBed(home.ctx, BEDTIME - 30, BEDTIME + 30);
    expect(home.notes).toHaveLength(0);

    const guest = harness({ location: 'transcorp-hilton', time: BEDTIME - 120 });
    await guest.service.book(guest.ctx, 'transcorp-hilton', 1);
    await guest.service.noteNoBed(guest.ctx, BEDTIME - 30, BEDTIME + 30);
    expect(guest.notes.filter((note) => note.startsWith('Nowhere'))).toHaveLength(0);

    const road = harness({ location: 'wuse-market' });
    road.ctx.character.travel = {} as never;
    await road.service.noteNoBed(road.ctx, BEDTIME - 30, BEDTIME + 30);
    expect(road.notes).toHaveLength(0);
  });

  it('the autopilot beds you at a hotel only while the stay is active: not before it starts, not after checkout', async () => {
    const { service, ctx } = harness();
    const system = new HotelsSystem({ register: () => undefined } as never, service);
    const booked = await service.book(ctx, 'transcorp-hilton', 1);
    expect(await system.residence(ctx, booked.stay.startedAt - 1)).toBeNull();
    expect(await system.residence(ctx, booked.stay.startedAt)).not.toBeNull();
    expect(await system.residence(ctx, booked.stay.checkoutAt)).toBeNull();
    await service.checkout(ctx);
    expect(await system.residence(ctx, ctx.time)).toBeNull();
  });
});
