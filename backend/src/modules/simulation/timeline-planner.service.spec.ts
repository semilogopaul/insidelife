import { describe, expect, it } from 'vitest';
import {
  MINUTES_PER_HOUR,
  fromDateParts,
  homeLocationId,
  type GameMinute,
  type Habit,
} from '@insidelife/shared';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import type { WorldService } from '../world/world.service.js';
import type { ScheduleBlock, SimulationSystem } from './interfaces/simulation-system.interface.js';
import { SimulationContext } from './simulation-context.js';
import { SimulationRegistry } from './simulation-registry.service.js';
import { TimelinePlanner } from './timeline-planner.service.js';

const SEED = 'planner-spec';
// A Monday in the dry season (no rain surprises in traffic maths).
const MONDAY = fromDateParts({ year: 2027, month: 11, day: 1 });

const world = {
  seed: SEED,
  economy: () => ({ priceIndex: 1, usdRate: 1360, gbpRate: 1780, fuelPrice: 1350, tbillRate: 0.11, savingsRate: 0.035, moneyMarketRate: 0.075, fareMultiplier: 1 }),
  weather: () => ({ condition: 'clear', intensity: 0, raining: false, temperatureC: 30, season: 'dry' }),
} as unknown as WorldService;

function character(overrides: Partial<CharacterEntity> = {}): CharacterEntity {
  return {
    id: 'c1',
    homeDistrictId: 'surulere',
    defaultTransport: 'danfo',
    locationId: homeLocationId('c1'),
    regionId: 'lagos',
    travel: null,
    activity: null,
    settledAt: MONDAY,
    seed: 'seed',
    needs: { energy: 80, hunger: 80, hygiene: 80, fun: 80, social: 80 },
    habits: [],
    habitsPausedUntil: null,
    skills: { intellect: 20, tech: 20, hustle: 20, charisma: 20, business: 20, finance: 20, trade: 20, creative: 20, cooking: 20, fitness: 20, medicine: 0, law: 0, engineering: 0 },
    bornAt: MONDAY - 25 * 360 * 1440,
    ...overrides,
  } as CharacterEntity;
}

function plannerWith(blocks: (day: number) => ScheduleBlock[]): TimelinePlanner {
  const registry = new SimulationRegistry();
  const work: SimulationSystem = { key: 'test-work', order: 1, scheduleForDay: async (_ctx, day) => blocks(day) };
  registry.register(work);
  return new TimelinePlanner(registry);
}

function ctxFor(c: CharacterEntity, t: GameMinute): SimulationContext {
  return new SimulationContext(c, {} as never, world, t);
}

const workBlock = (day: number): ScheduleBlock[] => {
  const start = day * 1440 + 8 * MINUTES_PER_HOUR;
  return [{ kind: 'work', startsAt: start, endsAt: start + 9 * MINUTES_PER_HOUR, locationId: 'marina', label: 'Work at Marina', priority: 10, commute: true }];
};

const dawnShift = (day: number): ScheduleBlock[] => {
  const start = day * 1440 + 5 * MINUTES_PER_HOUR;
  return [{ kind: 'work', startsAt: start, endsAt: start + 12 * MINUTES_PER_HOUR, locationId: 'marina', label: 'Dawn shift', priority: 10, commute: true }];
};

const nightShift = (day: number): ScheduleBlock[] => {
  const start = day * 1440 + 19 * MINUTES_PER_HOUR;
  return [{ kind: 'work', startsAt: start, endsAt: start + 11 * MINUTES_PER_HOUR, locationId: 'marina', label: 'Night shift', priority: 10, commute: true }];
};

describe('TimelinePlanner', () => {
  it('leaves home early enough to beat Lagos traffic to an 8am shift', async () => {
    const planner = plannerWith(workBlock);
    const t = MONDAY + 6 * MINUTES_PER_HOUR + 40;
    const ctx = ctxFor(character({ settledAt: t }), t);
    const segments = await planner.plan(ctx, t, 6 * MINUTES_PER_HOUR);
    const commute = segments.find((segment) => segment.kind === 'commute');
    const work = segments.find((segment) => segment.kind === 'work');
    expect(commute).toBeDefined();
    expect(work).toBeDefined();
    expect(commute!.startsAt).toBeLessThan(MONDAY + 8 * MINUTES_PER_HOUR);
    expect(commute!.endsAt).toBeLessThanOrEqual(work!.startsAt);
    expect(work!.locationId).toBe('marina');
  });

  it('eats breakfast at home when idle at mealtime', async () => {
    const planner = plannerWith(() => []);
    const t = MONDAY + 6 * MINUTES_PER_HOUR + 45;
    const ctx = ctxFor(character({ settledAt: t }), t);
    const segments = await planner.plan(ctx, t, 2 * MINUTES_PER_HOUR);
    const meal = segments.find((segment) => segment.actionId === 'home-meal');
    expect(meal?.startsAt).toBe(MONDAY + 7 * MINUTES_PER_HOUR);
    expect(meal?.profile.hunger.target).toBe(100);
  });

  it('goes home after work and sleeps at night', async () => {
    const planner = plannerWith(workBlock);
    const t = MONDAY + 16 * MINUTES_PER_HOUR + 30;
    const ctx = ctxFor(character({ settledAt: t, locationId: 'marina' }), t);
    const segments = await planner.plan(ctx, t, 12 * MINUTES_PER_HOUR);
    const kinds = segments.map((segment) => segment.kind);
    expect(kinds).toContain('commute');
    const sleep = segments.find((segment) => segment.kind === 'sleep');
    expect(sleep?.locationId).toBe(homeLocationId('c1'));
    expect(sleep!.startsAt).toBeGreaterThanOrEqual(MONDAY + 23 * MINUTES_PER_HOUR);
  });

  it('lets an explicit action override the routine', async () => {
    const planner = plannerWith(workBlock);
    const t = MONDAY + 9 * MINUTES_PER_HOUR;
    const c = character({
      settledAt: t,
      locationId: 'shitta-amala',
      activity: { actionId: 'eat-buka', startedAt: t, endsAt: t + 45, locationId: 'shitta-amala', cost: 3500 },
    });
    const segments = await planner.plan(ctxFor(c, t), t, 90);
    expect(segments[0]).toMatchObject({ kind: 'action', actionId: 'eat-buka', explicit: true });
    expect(segments[1]?.kind).toBe('commute');
  });

  it('goes to bed early before a dawn shift so the worker still gets a night of sleep', async () => {
    const planner = plannerWith(dawnShift);
    const t = MONDAY + 20 * MINUTES_PER_HOUR;
    const ctx = ctxFor(character({ settledAt: t }), t);
    const segments = await planner.plan(ctx, t, 10 * MINUTES_PER_HOUR);
    const sleep = segments.find((segment) => segment.kind === 'sleep');
    const commute = segments.find((segment) => segment.kind === 'commute');
    expect(sleep!.startsAt).toBeLessThan(MONDAY + 23 * MINUTES_PER_HOUR);
    expect(sleep!.startsAt).toBeGreaterThanOrEqual(MONDAY + 20 * MINUTES_PER_HOUR + 30);
    expect(commute!.startsAt - sleep!.startsAt).toBeGreaterThanOrEqual(7 * MINUTES_PER_HOUR);
  });

  it('turns in early when exhausted, and stays asleep until morning', async () => {
    const planner = plannerWith(() => []);
    const t = MONDAY + 20 * MINUTES_PER_HOUR + 45;
    const ctx = ctxFor(character({ settledAt: t, needs: { energy: 6, hunger: 80, hygiene: 60, fun: 40, social: 50 } }), t);
    const segments = await planner.plan(ctx, t, 6 * MINUTES_PER_HOUR);
    expect(segments[0]).toMatchObject({ kind: 'sleep', startsAt: t, explicit: false });
    expect(segments[0]!.endsAt).toBeGreaterThanOrEqual(t + 6 * MINUTES_PER_HOUR);
  });

  it('eats when home hungry after a long commute, then sleeps, then has breakfast', async () => {
    const planner = plannerWith(() => []);
    const t = MONDAY + 20 * MINUTES_PER_HOUR + 40;
    const ctx = ctxFor(character({ settledAt: t, needs: { energy: 50, hunger: 22, hygiene: 60, fun: 40, social: 50 } }), t);
    const segments = await planner.plan(ctx, t, 12 * MINUTES_PER_HOUR);
    expect(segments[0]).toMatchObject({ kind: 'action', actionId: 'home-meal', startsAt: t, endsAt: t + 30 });
    expect(segments.find((segment) => segment.kind === 'sleep')?.startsAt).toBe(MONDAY + 23 * MINUTES_PER_HOUR);
    const breakfast = segments.find((segment) => segment.actionId === 'home-meal' && segment.startsAt > t);
    expect(breakfast?.startsAt).toBeLessThanOrEqual(MONDAY + 1440 + 7 * MINUTES_PER_HOUR);
  });

  describe('habits', () => {
    const study: Habit = { actionId: 'study', startMinute: 20 * MINUTES_PER_HOUR, durationMinutes: 2 * MINUTES_PER_HOUR, days: 'daily' };

    it('runs a habit on time while the player is away', async () => {
      const planner = plannerWith(() => []);
      const t = MONDAY + 18 * MINUTES_PER_HOUR;
      const segments = await planner.plan(ctxFor(character({ settledAt: t, habits: [study] }), t), t, 5 * MINUTES_PER_HOUR);
      const session = segments.find((segment) => segment.actionId === 'study');
      expect(session).toMatchObject({ kind: 'action', startsAt: MONDAY + 20 * MINUTES_PER_HOUR, endsAt: MONDAY + 22 * MINUTES_PER_HOUR });
    });

    it('rests instead when exhausted, and respects a cancelled session', async () => {
      const planner = plannerWith(() => []);
      const t = MONDAY + 20 * MINUTES_PER_HOUR;
      const tired = character({ settledAt: t, habits: [study], needs: { energy: 22, hunger: 80, hygiene: 80, fun: 80, social: 80 } });
      expect((await planner.plan(ctxFor(tired, t), t, 60)).some((segment) => segment.actionId === 'study')).toBe(false);
      const paused = character({ settledAt: t, habits: [study], habitsPausedUntil: t + 2 * MINUTES_PER_HOUR });
      expect((await planner.plan(ctxFor(paused, t), t, 60)).some((segment) => segment.actionId === 'study')).toBe(false);
    });

    it('wakes early for a dawn habit', async () => {
      const planner = plannerWith(() => []);
      const workout: Habit = { actionId: 'home-workout', startMinute: 5 * MINUTES_PER_HOUR + 30, durationMinutes: 45, days: 'daily' };
      const t = MONDAY + 2 * MINUTES_PER_HOUR;
      const segments = await planner.plan(ctxFor(character({ settledAt: t, habits: [workout] }), t), t, 5 * MINUTES_PER_HOUR);
      expect(segments.find((segment) => segment.kind === 'sleep')?.endsAt).toBe(MONDAY + 5 * MINUTES_PER_HOUR + 30);
      expect(segments.find((segment) => segment.actionId === 'home-workout')?.startsAt).toBe(MONDAY + 5 * MINUTES_PER_HOUR + 30);
    });
  });

  it('lets night-shift workers sleep in the day after their shift', async () => {
    const planner = plannerWith(nightShift);
    const t = MONDAY + 6 * MINUTES_PER_HOUR + 5;
    const ctx = ctxFor(character({ settledAt: t, locationId: 'marina' }), t);
    const segments = await planner.plan(ctx, t, 10 * MINUTES_PER_HOUR);
    const sleep = segments.find((segment) => segment.kind === 'sleep');
    expect(sleep).toBeDefined();
    expect(sleep!.label).toContain('night shift');
    expect(sleep!.endsAt - sleep!.startsAt).toBeGreaterThan(5 * MINUTES_PER_HOUR);
  });
});
