import { describe, expect, it, vi } from 'vitest';
import { MINUTES_PER_DAY, type TransportMode } from '@insidelife/shared';
import type { HomeAccessPort } from '../../common/ports/home-access.port.js';
import type { VehiclePort } from '../../common/ports/vehicle.port.js';
import type { ScheduleBlock } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { SimulationEngine } from '../simulation/simulation-engine.service.js';
import type { TimelinePlanner } from '../simulation/timeline-planner.service.js';
import type { MovementTracker } from './movement-tracker.service.js';
import { MovementService } from './movement.service.js';

const BERGER = 'berger-car-market';
/** 7:36 PM: Berger Car Mart (8–18) closed hours ago. */
const EVENING = 40 * MINUTES_PER_DAY + 19 * 60 + 36;

/** MovementService over a planner that quotes a 22-minute, ₦15,000 ride for every mode. */
function harness(time: number, blocks: readonly ScheduleBlock[] = []) {
  const planner = {
    itemTags: async () => [],
    quote: async (_ctx: unknown, _from: string, _to: string, mode: TransportMode) => ({ mode, minutes: 22, fare: 15_000, intercity: false }),
    blocksAround: async () => blocks,
  } as unknown as TimelinePlanner;
  const pay = vi.fn(async () => true);
  const tracker = { clear: vi.fn(async () => undefined) } as unknown as MovementTracker;
  const ctx = {
    time,
    character: { id: 'c1', alive: true, travel: null, activity: null, locationId: 'street:ikeja' },
    wallet: { pay },
  } as unknown as SimulationContext;
  const service = new MovementService(planner, {} as SimulationEngine, tracker, {} as VehiclePort, {} as HomeAccessPort);
  return { service, ctx, pay };
}

describe('rides to a place that will be closed when you get there', () => {
  it('flags the quote with the opening hour', async () => {
    const { service, ctx } = harness(EVENING);
    const bolt = (await service.quotes(ctx, BERGER)).find((quote) => quote.mode === 'bolt');
    expect(bolt).toMatchObject({ available: true, closedOnArrival: 8 });
  });

  it('refuses the booking (no fare taken) until the player says they know', async () => {
    const { service, ctx, pay } = harness(EVENING);
    await expect(service.travel(ctx, BERGER, 'bolt')).rejects.toMatchObject({ errorCode: 'CLOSED_ON_ARRIVAL' });
    expect(pay).not.toHaveBeenCalled();
    await service.travel(ctx, BERGER, 'bolt', true);
    expect(pay).toHaveBeenCalledOnce();
    expect(ctx.character.travel?.toLocationId).toBe(BERGER);
  });

  it('lets you go when it’s open, or when your shift there starts soon', async () => {
    const noon = harness(40 * MINUTES_PER_DAY + 12 * 60);
    expect((await noon.service.quotes(noon.ctx, BERGER)).every((quote) => quote.closedOnArrival === undefined)).toBe(true);
    const shift: ScheduleBlock = { kind: 'work', startsAt: EVENING + 60, endsAt: EVENING + 8 * 60, locationId: BERGER, label: 'Work', priority: 2, commute: true };
    const staff = harness(EVENING, [shift]);
    await staff.service.travel(staff.ctx, BERGER, 'bolt');
    expect(staff.pay).toHaveBeenCalledOnce();
  });
});
