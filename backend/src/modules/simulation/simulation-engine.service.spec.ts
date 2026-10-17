import { describe, expect, it } from 'vitest';
import {
  COLLAPSE_TARGET,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  fromDateParts,
  homeLocationId,
  realMsAt,
  type GameMinute,
} from '@insidelife/shared';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import type { LedgerService } from '../ledger/ledger.service.js';
import type { WorldService } from '../world/world.service.js';
import type { ScheduleBlock, SimulationSystem } from './interfaces/simulation-system.interface.js';
import { awayStamp } from './player-presence.js';
import { COLLAPSE_AFTER_MINUTES, COLLAPSE_SLEEP_MINUTES } from './rest.js';
import { SimulationContext, type CharacterWallet } from './simulation-context.js';
import { SimulationEngine, deprivationHours } from './simulation-engine.service.js';
import { SimulationRegistry } from './simulation-registry.service.js';
import { TimelinePlanner } from './timeline-planner.service.js';

// A Monday in the dry season (no rain in the traffic maths).
const MONDAY = fromDateParts({ year: 2027, month: 11, day: 1 });
const CLOCK = { epochRealMs: 0, epochGameMinute: 0, scale: 60 };
const HOME = homeLocationId('c1');

const world = {
  seed: 'engine-spec',
  clock: CLOCK,
  economy: () => ({ priceIndex: 1, usdRate: 1360, gbpRate: 1780, fuelPrice: 1350, tbillRate: 0.11, savingsRate: 0.035, moneyMarketRate: 0.075, fareMultiplier: 1 }),
  weather: () => ({ condition: 'clear', intensity: 0, raining: false, temperatureC: 30, season: 'dry' }),
} as unknown as WorldService;

const ledger = { balances: async () => ({ cash: 1_000_000, savings: 0, pension: 0, usd: 0 }) } as unknown as LedgerService;
const wallet = { flush: async () => undefined, tryPay: async () => true, tryAccrue: () => true } as unknown as CharacterWallet;

/** The player made a move at game minute `t`. */
const playingAt = (t: GameMinute): Date => new Date(realMsAt(CLOCK, t));

function character(overrides: Partial<CharacterEntity> = {}): CharacterEntity {
  return {
    id: 'c1',
    firstName: 'Ada',
    background: 'working-class',
    homeDistrictId: 'surulere',
    defaultTransport: 'danfo',
    locationId: HOME,
    cityId: 'lagos',
    travel: null,
    activity: null,
    settledAt: MONDAY,
    lastSleptAt: MONDAY,
    lastActiveAt: new Date(0),
    seed: 'seed',
    alive: true,
    health: 80,
    fitness: 40,
    status: 0,
    netWorth: 0,
    moodModifiers: [],
    needs: { energy: 70, hunger: 70, hygiene: 70, fun: 70, social: 70 },
    habits: [],
    habitsPausedUntil: null,
    skills: { intellect: 20, tech: 20, hustle: 20, charisma: 20, business: 20, finance: 20, trade: 20, creative: 20, cooking: 20, fitness: 20, medicine: 0, law: 0, engineering: 0 },
    bornAt: MONDAY - 25 * 360 * MINUTES_PER_DAY,
    ...overrides,
  } as CharacterEntity;
}

function harness(blocks: (day: number) => ScheduleBlock[] = () => []) {
  const registry = new SimulationRegistry();
  const routine: SimulationSystem = { key: 'test-routine', order: 1, scheduleForDay: async (_ctx, day) => blocks(day) };
  registry.register(routine);
  const planner = new TimelinePlanner(registry);
  const engine = new SimulationEngine(registry, planner, ledger);
  return { planner, engine };
}

/** One request: a fresh context (like `CharacterSession.run`) settled to `until`. */
async function settle(engine: SimulationEngine, c: CharacterEntity, until: GameMinute): Promise<SimulationContext> {
  const ctx = new SimulationContext(c, {} as never, world, until);
  ctx.bindWallet(wallet);
  await engine.settle(ctx, until);
  return ctx;
}

/** Settle `from → to` in `chunks` equal requests; `beforeEach(t)` runs before each (e.g. the player's move). */
async function settleInChunks(engine: SimulationEngine, c: CharacterEntity, to: GameMinute, chunks: number, beforeEach?: (t: GameMinute) => void): Promise<string[]> {
  const from = c.settledAt;
  const titles: string[] = [];
  for (let i = 1; i <= chunks; i++) {
    const until = from + Math.round(((to - from) * i) / chunks);
    const ctx = await settle(engine, c, until);
    titles.push(...ctx.notifications.map((notification) => notification.title));
    beforeEach?.(until);
  }
  return titles;
}

const fingerprint = (c: CharacterEntity) => ({
  locationId: c.locationId,
  travel: c.travel,
  activity: c.activity,
  lastSleptAt: c.lastSleptAt,
  needs: Object.fromEntries(Object.entries(c.needs).map(([key, value]) => [key, Number(value.toFixed(6))])),
  health: Number(c.health.toFixed(6)),
});

describe('SimulationEngine: the player at the controls', () => {
  it('leaves a playing player where they are at bedtime, needs running low, however the night is settled', async () => {
    const { engine } = harness();
    const start = MONDAY + 22 * MINUTES_PER_HOUR;
    const venue = 'shitta-amala';
    // The client reports in every few real seconds; each request settles first, then stamps the move.
    const c = character({ settledAt: start, locationId: venue, lastActiveAt: playingAt(start), needs: { energy: 12, hunger: 9, hygiene: 50, fun: 40, social: 40 } });
    await settleInChunks(engine, c, start + 8 * MINUTES_PER_HOUR, 32, (t) => (c.lastActiveAt = playingAt(t)));
    expect(c.locationId).toBe(venue);
    expect(c.travel).toBeNull();
    expect(c.activity).toBeNull();
    expect(c.needs.energy).toBe(0);
    expect(c.needs.hunger).toBe(0);
    expect(c.health).toBeLessThan(80);
  });

  it('runs the old autopilot for an idle player: home, fed, asleep', async () => {
    const { engine } = harness();
    const start = MONDAY + 22 * MINUTES_PER_HOUR;
    const c = character({ settledAt: start, locationId: 'shitta-amala', needs: { energy: 30, hunger: 30, hygiene: 50, fun: 40, social: 40 } });
    await settle(engine, c, start + 7 * MINUTES_PER_HOUR);
    expect(c.locationId).toBe(HOME);
    expect(c.activity).toMatchObject({ actionId: 'sleep', targetId: 'autopilot' });
    expect(c.lastSleptAt).toBeGreaterThan(start);
  });

  it('picks up an autopilot trip in progress when the player comes back, then never puts them to bed until they leave', async () => {
    const { engine } = harness();
    const start = MONDAY + 22 * MINUTES_PER_HOUR + 50;
    const c = character({ settledAt: start, locationId: 'shitta-amala' });
    // Away: at 23:00 the autopilot heads home.
    await settle(engine, c, MONDAY + 23 * MINUTES_PER_HOUR + 5);
    expect(c.travel).toMatchObject({ toLocationId: HOME });
    // Back at the controls at 23:05: the bus keeps going (nobody teleports), but nothing new starts.
    c.lastActiveAt = playingAt(MONDAY + 23 * MINUTES_PER_HOUR + 5);
    await settleInChunks(engine, c, MONDAY + MINUTES_PER_DAY + 2 * MINUTES_PER_HOUR, 12, (t) => (c.lastActiveAt = playingAt(t)));
    expect(c.locationId).toBe(HOME);
    expect(c.travel).toBeNull();
    expect(c.activity).toBeNull();
    // They close the app ("away"): the autopilot puts them straight to bed.
    c.lastActiveAt = awayStamp(c.lastActiveAt, realMsAt(CLOCK, c.settledAt));
    await settle(engine, c, c.settledAt + 10);
    expect(c.activity).toMatchObject({ actionId: 'sleep', targetId: 'autopilot' });
  });

  it('hands over to the autopilot exactly when presence lapses, whatever the chunking', async () => {
    const { engine } = harness();
    const start = MONDAY + 20 * MINUTES_PER_HOUR;
    const make = () => character({ settledAt: start, lastActiveAt: playingAt(start) });
    const once = make();
    await settle(engine, once, start + 6 * MINUTES_PER_HOUR);
    const chunked = make();
    await settleInChunks(engine, chunked, start + 6 * MINUTES_PER_HOUR, 7);
    expect(fingerprint(chunked)).toEqual(fingerprint(once));
    // Present until 01:00 (5 real minutes at ×60), then straight to bed.
    expect(once.activity).toMatchObject({ actionId: 'sleep', startedAt: start + 5 * MINUTES_PER_HOUR + 1 });
  });
});

describe('SimulationEngine: collapse after ten days without sleep', () => {
  it('collapses a sleepless player once, on day ten, with a warning two days before, the same in one settle or many', async () => {
    const { engine } = harness();
    const start = MONDAY + 9 * MINUTES_PER_HOUR;
    const end = start + COLLAPSE_AFTER_MINUTES + 12 * MINUTES_PER_HOUR;
    // Playing the whole span (a move stamped at the end covers every moment before it).
    const make = () => character({ settledAt: start, lastSleptAt: start, locationId: 'shitta-amala', lastActiveAt: playingAt(end) });

    const once = make();
    const onceCtx = await settle(engine, once, end);
    const chunked = make();
    const titles = await settleInChunks(engine, chunked, end, 37);
    expect(fingerprint(chunked)).toEqual(fingerprint(once));

    const titlesOnce = onceCtx.notifications.map((notification) => notification.title);
    expect(titlesOnce.filter((title) => title === 'You collapsed from exhaustion')).toHaveLength(1);
    expect(titlesOnce.some((title) => title.endsWith('days without proper sleep'))).toBe(true);
    expect(titles.filter((title) => title === 'You collapsed from exhaustion')).toHaveLength(1);

    // Slept it off where they fell; the clock restarted when the collapse ended.
    expect(once.locationId).toBe('shitta-amala');
    expect(once.lastSleptAt).toBe(start + COLLAPSE_AFTER_MINUTES + COLLAPSE_SLEEP_MINUTES);
    expect(once.activity).toBeNull();
    expect(once.moodModifiers.some((modifier) => modifier.id === 'collapsed')).toBe(true);
  });

  it('never collapses someone who sleeps (the autopilot puts an idle player to bed every night)', async () => {
    const { engine } = harness();
    const c = character({ settledAt: MONDAY });
    const ctx = await settle(engine, c, MONDAY + 12 * MINUTES_PER_DAY);
    expect(ctx.notifications.some((notification) => notification.title === 'You collapsed from exhaustion')).toBe(false);
    expect(c.lastSleptAt).toBeGreaterThan(MONDAY + 11 * MINUTES_PER_DAY);
    expect(c.activity?.targetId).not.toBe(COLLAPSE_TARGET);
  });
});

describe('deprivationHours', () => {
  it('is additive: splitting a span anywhere costs the same', () => {
    const drift = { target: 0, rate: 4.5 };
    const whole = deprivationHours(30, drift, 12, 15);
    for (const cut of [0.5, 2, 3.3333, 6.7, 11]) {
      const first = deprivationHours(30, drift, cut, 15);
      const second = deprivationHours(Math.max(0, 30 - 4.5 * cut), drift, 12 - cut, 15);
      expect(first + second).toBeCloseTo(whole, 9);
    }
  });

  it('counts time spent flat at the bottom in full and nothing above the threshold', () => {
    expect(deprivationHours(0, { target: 0, rate: 3 }, 5, 8)).toBe(5);
    expect(deprivationHours(60, { target: 50, rate: 3 }, 5, 8)).toBe(0);
    // 8 → 0 over 2h (half deep on average), then 3h at 0.
    expect(deprivationHours(8, { target: 0, rate: 4 }, 5, 8)).toBeCloseTo(1 + 3, 9);
    // Recovering from 0 to 16 at 8/h: deep for the first hour only (average half).
    expect(deprivationHours(0, { target: 100, rate: 8 }, 2, 8)).toBeCloseTo(0.5, 9);
  });
});
