import { Inject, Injectable } from '@nestjs/common';
import {
  MAP_KM_PER_WORLD_METRE,
  MINUTES_PER_HOUR,
  TRANSPORT,
  TRANSPORT_MODES,
  ENTRY_RADIUS,
  districtAt,
  findVenue,
  formatGameDuration,
  homeEntrance,
  homeKey,
  homeLocationId,
  isHomeLocation,
  isStreetLocation,
  isVenueOpen,
  straightDistance,
  streetLocationId,
  toDateParts,
  venueEntrance,
  type DistrictId,
  type Entrance,
  type SpawnPoint,
  type TransportMode,
  type WorldPoint,
  isInterruptibleActivity,
} from '@insidelife/shared';
import { GameRuleException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { HOME_ACCESS_PORT, type HomeAccessPort } from '../../common/ports/home-access.port.js';
import { VEHICLE_PORT, type VehiclePort } from '../../common/ports/vehicle.port.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationEngine } from '../simulation/simulation-engine.service.js';
import { TimelinePlanner } from '../simulation/timeline-planner.service.js';
import { MovementTracker } from './movement-tracker.service.js';

/** How long one heartbeat keeps the "exploring" state alive (game minutes ≈ 30 real seconds). */
const EXPLORE_WINDOW = 60;
/** Fallback fuel economy (map km per litre) if the car's own figure is unknown. */
const DEFAULT_KM_PER_LITRE = 10;
/** Diesel costs more than petrol at the pump (≈ ₦1,750 vs ₦1,350). */
const DIESEL_PREMIUM = 1.3;

export interface TravelQuoteDto {
  readonly mode: TransportMode;
  readonly label: string;
  readonly minutes: number;
  readonly fare: number;
  readonly available: boolean;
  readonly reason?: string;
}

/**
 * Moving around Lagos. Two ways:
 * - **Open world**: exit a building, walk or drive yourself (client-simulated, server-validated), enter another.
 * - **Ride**: pick a destination and a mode (danfo, Bolt, okada…); the server times the trip and the client plays it.
 */
@Injectable()
export class MovementService {
  constructor(
    private readonly planner: TimelinePlanner,
    private readonly engine: SimulationEngine,
    private readonly tracker: MovementTracker,
    @Inject(VEHICLE_PORT) private readonly vehicles: VehiclePort,
    @Inject(HOME_ACCESS_PORT) private readonly homes: HomeAccessPort,
  ) {}

  /** Step out of the current building onto the street. */
  async exit(ctx: SimulationContext): Promise<SpawnPoint> {
    const character = ctx.character;
    this.assertCanMove(ctx);
    const entrance = await this.entranceOf(ctx, character.locationId, 'exit');
    if (!entrance) throw new GameRuleException('NO_EXIT', 'You can only step outside in Lagos — take a bus back first');

    const district = character.locationId === homeLocationId(character.id) ? character.homeDistrictId : districtAt(entrance.position);
    character.locationId = streetLocationId(district);
    character.activity = { actionId: 'explore', startedAt: ctx.time, endsAt: ctx.time + EXPLORE_WINDOW, locationId: character.locationId, cost: 0 };
    await this.tracker.anchor(character.id, entrance.position, 'walk', entrance.heading);

    const car = await this.vehicles.driving(ctx);
    return { locationId: character.locationId, entrance, hasCar: car !== null, car };
  }

  /** Keep exploring alive and accept a plausible new position. Returns false if the move was rejected. */
  async heartbeat(ctx: SimulationContext, position: WorldPoint, mode: 'walk' | 'car', heading = 0): Promise<boolean> {
    const character = ctx.character;
    if (!isStreetLocation(character.locationId)) return false;
    if (mode === 'car' && !(await this.vehicles.driving(ctx))) return false;
    const check = await this.tracker.isPlausible(character.id, position, mode);
    if (!check.ok) return false;

    if (mode === 'car' && check.from) await this.chargeFuel(ctx, check.distance, `fuel:${ctx.time}`);
    await this.tracker.anchor(character.id, position, mode, heading);
    character.locationId = streetLocationId(districtAt(position));
    character.activity = { actionId: 'explore', startedAt: character.activity?.startedAt ?? ctx.time, endsAt: ctx.time + EXPLORE_WINDOW, locationId: character.locationId, cost: 0 };
    return true;
  }

  /** Walk through a door. The position must be at the entrance and reachable since the last accepted fix. */
  async enter(ctx: SimulationContext, locationId: string, position: WorldPoint, mode: 'walk' | 'car'): Promise<void> {
    const character = ctx.character;
    if (!isStreetLocation(character.locationId)) throw new GameRuleException('NOT_OUTSIDE', 'You’re already inside somewhere');
    const entrance = await this.entranceOf(ctx, locationId, 'enter');
    if (!entrance && isHomeLocation(locationId) && locationId !== homeLocationId(character.id)) {
      throw new GameRuleException('NOT_YOUR_HOUSE', 'Knock first — you need an invite to walk into someone else’s house');
    }
    if (!entrance) throw new ResourceNotFoundException('Place');
    if (straightDistance(position, entrance.position) > ENTRY_RADIUS) {
      throw new GameRuleException('TOO_FAR', 'Walk up to the entrance first');
    }
    const venue = findVenue(locationId);
    if (venue && !isVenueOpen(venue, toDateParts(ctx.time).hour)) {
      const [open, close] = venue.hours ?? [0, 24];
      throw new GameRuleException('CLOSED', `${venue.name} is closed. Opens ${open}:00, closes ${close % 24}:00`);
    }
    if (venue?.minStatus && character.status < venue.minStatus) {
      throw new GameRuleException('BOUNCER', `The bouncer looked you up and down. You need more clout to enter ${venue.name}.`);
    }

    const check = await this.tracker.isPlausible(character.id, entrance.position, mode);
    if (!check.ok) throw new GameRuleException('TELEPORT', 'You can’t be there yet — keep moving');
    if (mode === 'car' && check.from) await this.chargeFuel(ctx, check.distance, `fuel:enter:${ctx.time}`);

    await this.tracker.clear(character.id);
    const fromLocationId = character.locationId;
    character.locationId = locationId;
    character.activity = null;
    // At a venue or a friend's place the autopilot waits a while before taking you home.
    if (locationId !== homeLocationId(character.id)) this.engine.hangAround(ctx, ctx.time);
    const departAt = check.from ? Math.max(0, ctx.time - Math.round(((Date.now() - check.from.at) / 60_000) * ctx.world.clock.scale)) : ctx.time;
    await this.engine.dispatchArrival(ctx, {
      fromLocationId,
      toLocationId: locationId,
      mode: mode === 'car' ? 'car' : 'walk',
      departAt,
      arriveAt: ctx.time,
      fare: 0,
      explicit: true,
      source: 'open-world',
    });
  }

  /** Every mode's time and fare to a destination right now. */
  async quotes(ctx: SimulationContext, destinationId: string): Promise<TravelQuoteDto[]> {
    const character = ctx.character;
    await this.assertDestination(ctx, destinationId);
    const tags = await this.planner.itemTags(ctx);
    const results: TravelQuoteDto[] = [];
    for (const mode of TRANSPORT_MODES) {
      const definition = TRANSPORT[mode];
      if (definition.requiresVehicle && !tags.includes('car')) {
        results.push({ mode, label: definition.label, minutes: 0, fare: 0, available: false, reason: 'You don’t own a car yet' });
        continue;
      }
      const quote = await this.planner.quote(ctx, character.locationId, destinationId, mode, ctx.time);
      const available = quote.mode === mode || quote.intercity;
      results.push({
        mode,
        label: quote.intercity ? 'Interstate bus' : definition.label,
        minutes: available ? quote.minutes : 0,
        fare: available ? quote.fare : 0,
        available,
        reason: available ? undefined : `${definition.label} can’t make this trip`,
      });
      if (quote.intercity) break;
    }
    return results;
  }

  /** Book a timed ride (or auto-drive). The client plays it back along the GPS route. */
  async travel(ctx: SimulationContext, destinationId: string, mode: TransportMode): Promise<void> {
    const character = ctx.character;
    this.assertCanMove(ctx);
    await this.assertDestination(ctx, destinationId);
    if (destinationId === character.locationId) throw new GameRuleException('ALREADY_THERE', 'You’re already there');

    const tags = await this.planner.itemTags(ctx);
    if (TRANSPORT[mode].requiresVehicle && !tags.includes('car')) throw new GameRuleException('NO_CAR', 'You don’t own a car yet');

    const quote = await this.planner.quote(ctx, character.locationId, destinationId, mode, ctx.time);
    if (quote.mode !== mode && !quote.intercity) {
      throw new GameRuleException('MODE_UNAVAILABLE', `${TRANSPORT[mode].label} can’t make this trip — try danfo or Bolt`);
    }
    const destination = findVenue(destinationId)?.name ?? (destinationId === homeLocationId(character.id) ? 'home' : 'a friend’s place');
    if (quote.fare > 0) {
      await ctx.wallet.pay(quote.fare, 'transport', `${quote.intercity ? 'Interstate bus' : TRANSPORT[mode].label} to ${destination}`, `trip:${ctx.time}:${destinationId}`);
    }
    await this.tracker.clear(character.id);
    character.activity = null;
    character.travel = {
      fromLocationId: character.locationId,
      toLocationId: destinationId,
      mode: quote.mode,
      departAt: ctx.time,
      arriveAt: ctx.time + quote.minutes,
      fare: quote.fare,
      explicit: true,
    };
  }

  /** Fuel and wear for a stretch of open-world driving, using the driven car's real economy and fuel type. */
  private async chargeFuel(ctx: SimulationContext, worldMetres: number, key: string): Promise<void> {
    const car = await this.vehicles.driving(ctx);
    const km = worldMetres * MAP_KM_PER_WORLD_METRE;
    await this.vehicles.recordDistance(ctx, km);
    const litres = km / (car?.fuelEconomyKmPerLitre ?? DEFAULT_KM_PER_LITRE);
    const pump = ctx.world.economy(ctx.time).fuelPrice * (car?.fuelType === 'diesel' ? DIESEL_PREMIUM : 1);
    const cost = Math.round(litres * pump);
    if (cost < 50) return;
    const paid = await ctx.wallet.tryPay(cost, 'transport', `Fuel (${litres.toFixed(1)}L)`, key);
    if (!paid) {
      ctx.notify({ kind: 'bill', title: 'Fuel light is blinking', body: 'You couldn’t afford fuel. Park and take a danfo.', tone: 'bad' });
    }
  }

  /** A door: venues, your own home, or a host's home (to go in you need an accepted invite; leaving never does). */
  private async entranceOf(ctx: SimulationContext, locationId: string, way: 'enter' | 'exit'): Promise<Entrance | null> {
    if (isHomeLocation(locationId)) {
      const ownerId = locationId.slice('home:'.length);
      if (ownerId === ctx.character.id) return homeEntrance(homeKey(ownerId, ctx.character.homePropertyId), ctx.character.homeDistrictId as DistrictId);
      return way === 'exit' ? this.homes.doorOf(ctx, ownerId) : this.homes.invitedDoor(ctx, ownerId);
    }
    return venueEntrance(locationId);
  }

  private async assertDestination(ctx: SimulationContext, destinationId: string): Promise<void> {
    if (destinationId === homeLocationId(ctx.character.id)) return;
    if (isHomeLocation(destinationId)) {
      if (await this.homes.invitedDoor(ctx, destinationId.slice('home:'.length))) return;
      throw new GameRuleException('NOT_INVITED', 'You need an invite to go to someone’s house');
    }
    if (!findVenue(destinationId)) throw new ResourceNotFoundException('Destination');
  }

  private assertCanMove(ctx: SimulationContext): void {
    const character = ctx.character;
    if (!character.alive) throw new GameRuleException('DECEASED', 'This character has passed on');
    if (character.travel) {
      const remaining = character.travel.arriveAt - ctx.time;
      throw new GameRuleException('TRAVELLING', `You’re still on the road (${formatGameDuration(Math.max(1, remaining))} left)`);
    }
    if (character.activity && !isInterruptibleActivity(character.activity)) {
      throw new GameRuleException('BUSY', 'Finish or cancel what you’re doing first');
    }
  }

  /** Real seconds a game-minute trip takes, for client playback hints. */
  static realSecondsFor(minutes: number, scale: number): number {
    return (minutes / scale) * MINUTES_PER_HOUR;
  }
}
