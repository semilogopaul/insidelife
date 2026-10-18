import { Inject, Injectable } from '@nestjs/common';
import {
  MAP_KM_PER_WORLD_METRE,
  OTHER_CITY_REASON,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  SERVICE_RADIUS,
  TRANSPORT,
  TRANSPORT_MODES,
  cityDefaultMode,
  modeUnavailableReason,
  modesInCity,
  ENTRY_RADIUS,
  canDriveVehicle,
  closedOnArrival,
  districtAt,
  findServicePoint,
  findVenue,
  fuelStationDry,
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
  type DrivenVehicleDto,
  type Entrance,
  type HeartbeatRejection,
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
const EXPLORE_WINDOW = 30;

export interface HeartbeatOutcome {
  readonly accepted: boolean;
  readonly reason?: HeartbeatRejection;
  readonly car: DrivenVehicleDto | null;
}

const runs = (car: DrivenVehicleDto): boolean => canDriveVehicle(car);

export interface TravelQuoteDto {
  readonly mode: TransportMode;
  readonly label: string;
  readonly minutes: number;
  readonly fare: number;
  readonly available: boolean;
  readonly reason?: string;
  /** The destination will be shut when this ride gets you there: the hour it opens (booking needs `acceptClosed`). */
  readonly closedOnArrival?: number;
}

/** "8 AM", "noon", "midnight". */
function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  return `${h % 12} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * Moving around the city you are in (Lagos or Abuja; between cities you fly or take the interstate coach: `TravelService`). Two ways:
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
    if (!entrance) throw new GameRuleException('NO_EXIT', 'There is no way out of here');

    const district = character.locationId === homeLocationId(character.id) ? character.homeDistrictId : districtAt(entrance.position);
    character.locationId = streetLocationId(district);
    character.activity = { actionId: 'explore', startedAt: ctx.time, endsAt: ctx.time + EXPLORE_WINDOW, locationId: character.locationId, cost: 0 };
    await this.tracker.anchor(character.id, entrance.position, 'walk', entrance.heading);

    const car = await this.vehicles.driving(ctx);
    return { locationId: character.locationId, entrance, hasCar: car !== null, car };
  }

  /**
   * Keep exploring alive and accept a plausible new position. Driving burns fuel from the tank for the road distance
   * since the last fix (plus wear, the reported crash damage and a breakdown roll). A car that can't go — empty,
   * broken down, won't start — is only ever pushed: the move must be plausible on foot and nothing is burnt.
   */
  async heartbeat(ctx: SimulationContext, position: WorldPoint, mode: 'walk' | 'car', heading = 0, bumps = 0): Promise<HeartbeatOutcome> {
    const character = ctx.character;
    if (!isStreetLocation(character.locationId)) return { accepted: false, reason: 'not-outside', car: null };
    let car = await this.vehicles.driving(ctx);
    if (mode === 'car' && !car) return { accepted: false, reason: 'no-car', car: null };
    const pushing = mode === 'car' && car !== null && !runs(car);
    const check = await this.tracker.isPlausible(character.id, position, pushing ? 'walk' : mode);
    if (!check.ok) return { accepted: false, reason: pushing ? 'car-disabled' : 'implausible', car };

    if (mode === 'car' && !pushing && check.from) car = await this.vehicles.drive(ctx, check.distance * MAP_KM_PER_WORLD_METRE, Math.min(60, Math.max(0, bumps)));
    await this.tracker.anchor(character.id, position, pushing ? 'walk' : mode, heading);
    character.locationId = streetLocationId(districtAt(position));
    character.activity = { actionId: 'explore', startedAt: character.activity?.startedAt ?? ctx.time, endsAt: ctx.time + EXPLORE_WINDOW, locationId: character.locationId, cost: 0 };
    return { accepted: true, car };
  }

  /**
   * Buy fuel at a filling station on the street: you (or your car at the kerb) must be at the forecourt, there by a
   * plausible route since your last fix; during fuel scarcity some stations are dry that day.
   */
  async buyFuel(ctx: SimulationContext, stationId: string, position: WorldPoint, litres: number | null, idempotencyKey: string) {
    const station = await this.assertAtService(ctx, stationId, 'fuel', position);
    const dayIndex = Math.floor(ctx.time / MINUTES_PER_DAY);
    if (fuelStationDry(ctx.world.seed, station.id, dayIndex, ctx.world.isActive(ctx.time, 'fuel-scarcity'))) {
      throw new GameRuleException('STATION_DRY', `${station.name} has no fuel today (scarcity). Try another station, or order a jerrycan in Motors.`);
    }
    const sale = await this.vehicles.refuel(ctx, litres, station.name, `fuel:${station.id}:${idempotencyKey}`);
    if (!sale) throw new GameRuleException('NO_CAR', 'You don’t have a car to fill');
    return sale;
  }

  /** A proper repair at a mechanic workshop on the street (you must be there). */
  async seeMechanic(ctx: SimulationContext, workshopId: string, position: WorldPoint, idempotencyKey: string) {
    const workshop = await this.assertAtService(ctx, workshopId, 'mechanic', position);
    const repair = await this.vehicles.workshopRepair(ctx, workshop.name, `mechanic:${workshop.id}:${idempotencyKey}`);
    if (!repair) throw new GameRuleException('NO_CAR', 'You don’t have a car for the mechanic to look at');
    return repair;
  }

  private async assertAtService(ctx: SimulationContext, id: string, kind: 'fuel' | 'mechanic', position: WorldPoint) {
    const point = findServicePoint(id);
    if (!point || point.kind !== kind) throw new ResourceNotFoundException(kind === 'fuel' ? 'Filling station' : 'Mechanic');
    if (!isStreetLocation(ctx.character.locationId)) throw new GameRuleException('NOT_OUTSIDE', 'Step outside first');
    if (straightDistance(position, point.entrance.position) > SERVICE_RADIUS) {
      throw new GameRuleException('TOO_FAR', kind === 'fuel' ? 'Pull up at the pumps first' : 'Pull up at the workshop first');
    }
    const check = await this.tracker.isPlausible(ctx.character.id, position, 'car');
    if (!check.ok) throw new GameRuleException('TELEPORT', 'You can’t be there yet — keep moving');
    return point;
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

    // A car that can't go was pushed (or left at the kerb): the last stretch must be plausible on foot, nothing burnt.
    const car = mode === 'car' ? await this.vehicles.driving(ctx) : null;
    const driving = car !== null && runs(car);
    const check = await this.tracker.isPlausible(character.id, entrance.position, driving ? 'car' : 'walk');
    if (!check.ok) throw new GameRuleException('TELEPORT', 'You can’t be there yet — keep moving');
    if (driving && check.from) await this.vehicles.drive(ctx, check.distance * MAP_KM_PER_WORLD_METRE);

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
    // Only what runs in the city you are in (no danfo in Abuja, no green cab in Lagos).
    const from = await this.planner.place(ctx, character.locationId);
    const to = await this.planner.place(ctx, destinationId);
    const here = new Set<string>(modesInCity(from.cityId));
    for (const mode of TRANSPORT_MODES) {
      if (!here.has(mode) && from.cityId === to.cityId) continue;
      const definition = TRANSPORT[mode];
      if (definition.requiresVehicle && !tags.includes('car')) {
        results.push({ mode, label: definition.label, minutes: 0, fare: 0, available: false, reason: await this.noCarReason(ctx) });
        continue;
      }
      const quote = await this.planner.quote(ctx, character.locationId, destinationId, mode, ctx.time);
      // A destination in the other city has no road to it: nothing here goes there.
      if (quote.intercity) {
        return TRANSPORT_MODES.map((each) => ({ mode: each, label: TRANSPORT[each].label, minutes: 0, fare: 0, available: false, reason: OTHER_CITY_REASON }));
      }
      const available = quote.mode === mode;
      const opens = available ? await this.closedWhenYouArrive(ctx, destinationId, ctx.time + quote.minutes) : null;
      results.push({
        mode,
        label: definition.label,
        minutes: available ? quote.minutes : 0,
        fare: available ? quote.fare : 0,
        available,
        reason: available ? undefined : (modeUnavailableReason(mode, from.districtId, to.districtId) ?? `${definition.label} can’t make this trip`),
        ...(opens !== null ? { closedOnArrival: opens } : {}),
      });
    }
    return results;
  }

  /** Why there is no car to drive: none owned, or it is parked in the other city. */
  private async noCarReason(ctx: SimulationContext): Promise<string> {
    const away = await this.vehicles.parkedElsewhere(ctx);
    return away ? `Your car is parked in ${away === 'abuja' ? 'Abuja' : 'Lagos'}` : 'You don’t own a car yet';
  }

  /**
   * Book a timed ride (or auto-drive). The client plays it back along the GPS route. A ride that would drop you at a
   * place that's shut by then is refused unless you say you know (`acceptClosed`): fares aren't refunded at a locked gate.
   */
  async travel(ctx: SimulationContext, destinationId: string, mode: TransportMode, acceptClosed = false): Promise<void> {
    const character = ctx.character;
    this.assertCanMove(ctx);
    await this.assertDestination(ctx, destinationId);
    if (destinationId === character.locationId) throw new GameRuleException('ALREADY_THERE', 'You’re already there');

    const tags = await this.planner.itemTags(ctx);
    if (TRANSPORT[mode].requiresVehicle && !tags.includes('car')) throw new GameRuleException('NO_CAR', await this.noCarReason(ctx));

    const quote = await this.planner.quote(ctx, character.locationId, destinationId, mode, ctx.time);
    if (quote.intercity) throw new GameRuleException('OTHER_CITY', OTHER_CITY_REASON);
    if (quote.mode !== mode) {
      throw new GameRuleException('MODE_UNAVAILABLE', `${TRANSPORT[mode].label} can’t make this trip — try ${cityDefaultMode(character.cityId) === 'bus' ? 'the city bus' : 'a danfo'} or Bolt`);
    }
    const destination = findVenue(destinationId)?.name ?? (destinationId === homeLocationId(character.id) ? 'home' : 'a friend’s place');
    if (!acceptClosed) {
      const opens = await this.closedWhenYouArrive(ctx, destinationId, ctx.time + quote.minutes);
      if (opens !== null) {
        throw new GameRuleException('CLOSED_ON_ARRIVAL', `${destination} will be closed when you get there (opens ${hourLabel(opens)})`);
      }
    }
    if (quote.fare > 0) {
      await ctx.wallet.pay(quote.fare, 'transport', `${TRANSPORT[mode].label} to ${destination}`, `trip:${ctx.time}:${destinationId}`);
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

  /**
   * The hour a destination opens if it'll be shut when you arrive, else null. Your own shift or lecture there counts as
   * open: staff and students get in before the doors open to the public.
   */
  private async closedWhenYouArrive(ctx: SimulationContext, destinationId: string, arriveAt: number): Promise<number | null> {
    const venue = findVenue(destinationId);
    const opens = venue ? closedOnArrival(venue, arriveAt) : null;
    if (opens === null) return null;
    const blocks = await this.planner.blocksAround(ctx, arriveAt);
    const expected = blocks.some((block) => block.locationId === destinationId && block.endsAt > arriveAt && block.startsAt - arriveAt <= 3 * MINUTES_PER_HOUR);
    return expected ? null : opens;
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
