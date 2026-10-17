import { Injectable, type OnModuleInit } from '@nestjs/common';
import { BACKGROUNDS, DRIVERS_LICENCE, quoteTrip, toDateParts, trafficFuelFactor, trafficMultiplier, type ActionDefinition } from '@insidelife/shared';
import type { ActivityState, TravelState } from '../characters/entities/character.entity.js';
import { LifeEventsRegistry } from '../events/life-events.registry.js';
import type { SimulationSystem } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { TimelinePlanner } from '../simulation/timeline-planner.service.js';
import { LicenceService } from './licence.service.js';
import { vehicleLifeEvents } from './vehicles.events.js';
import { GARAGE_ROWS, VehiclesService } from './vehicles.service.js';

/** The car a Nepo Baby finds in the compound on day one. */
const NEPO_BABY_CAR = 'toyota-corolla-2017';
/** Secondary cars add this share of their prestige. */
const SECONDARY_CAR_STATUS = 0.25;

/**
 * Vehicles in the simulation: the `car` capability tag (a car that starts: fuel in the tank, not broken down —
 * unlocks driving and car commutes), fuel, wear and breakdowns from trips,
 * remote-purchase deliveries, month-end maintenance, the driving-test result, and cars in net worth and status.
 * Depreciation is closed-form (age in days × yearly rate), so value is always current without daily writes.
 */
@Injectable()
export class VehiclesSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'vehicles';
  readonly order = 130;
  readonly rowProbes = [GARAGE_ROWS];

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly lifeEvents: LifeEventsRegistry,
    private readonly planner: TimelinePlanner,
    private readonly vehicles: VehiclesService,
    private readonly licence: LicenceService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
    this.lifeEvents.register(...vehicleLifeEvents(this.vehicles, this.licence));
  }

  async onCharacterCreated(ctx: SimulationContext): Promise<void> {
    // Heirs inherit their parent's cars instead of getting another free starter car.
    if (BACKGROUNDS[ctx.character.background].startsWithCar && !ctx.character.predecessorId) await this.vehicles.grant(ctx, NEPO_BABY_CAR);
  }

  async itemTags(ctx: SimulationContext): Promise<readonly string[]> {
    return (await this.vehicles.drivable(ctx)).length > 0 ? ['car'] : [];
  }

  async onActionComplete(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void> {
    if (action.id === DRIVERS_LICENCE.actionId) await this.licence.complete(ctx, activity);
  }

  /** A drive (routine commute or booked trip in your own car) adds mileage and wear. */
  async onArrival(ctx: SimulationContext, travel: TravelState): Promise<void> {
    // Open-world drives already logged mileage and fuel through VEHICLE_PORT on the way.
    if (travel.mode !== 'car' || travel.source === 'open-world') return;
    const car = await this.vehicles.driving(ctx);
    if (!car) return;
    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const from = await this.planner.place(ctx, travel.fromLocationId);
    const to = await this.planner.place(ctx, travel.toLocationId);
    if (from.cityId !== to.cityId) return;
    const { distance } = quoteTrip(from.districtId, to.districtId, 'car', { hour: 12, weekend: false, raining: false, priceIndex: 1 });
    // Go-slow burns fuel: the traffic when you set off sets how much more per km.
    const departed = toDateParts(travel.departAt);
    const traffic = trafficMultiplier(departed.hour, departed.weekday >= 5, ctx.world.weather(travel.departAt).raining);
    await this.vehicles.drive(ctx, car, distance, { trafficFactor: trafficFuelFactor(traffic) });
  }

  async onDayEnd(ctx: SimulationContext): Promise<void> {
    await this.vehicles.deliverDue(ctx);
  }

  async onMonthEnd(ctx: SimulationContext, monthIndex: number): Promise<void> {
    await this.vehicles.chargeMaintenance(ctx, monthIndex);
  }

  async netWorth(ctx: SimulationContext): Promise<number> {
    let total = 0;
    for (const car of await this.vehicles.garage(ctx)) total += this.vehicles.value(ctx, car);
    return total;
  }

  /** Car prestige: the primary car in full, other delivered cars at a quarter. */
  async status(ctx: SimulationContext): Promise<number> {
    let total = 0;
    for (const { row, def } of await this.vehicles.garage(ctx)) {
      if (row.status !== 'owned') continue;
      total += row.isPrimary ? def.status : def.status * SECONDARY_CAR_STATUS;
    }
    return Math.round(total);
  }
}
