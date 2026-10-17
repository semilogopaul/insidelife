import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CITIES, cityOfVenue, findFlight, findVenue } from '@insidelife/shared';
import type { TravelState } from '../characters/entities/character.entity.js';
import type { SimulationSystem } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { FlightBookingEntity } from './entities/flight-booking.entity.js';

/** Closes a boarded booking when its flight lands, and welcomes the traveller to the city. */
@Injectable()
export class TravelSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'travel';
  readonly order = 120;

  constructor(private readonly registry: SimulationRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async onArrival(ctx: SimulationContext, travel: TravelState): Promise<void> {
    if (travel.mode !== 'flight' && travel.mode !== 'coach') return;
    if (travel.mode === 'flight' && travel.flightId && findFlight(ctx.world.seed, travel.flightId)) {
      await ctx.manager.update(FlightBookingEntity, { characterId: ctx.character.id, flightId: travel.flightId, status: 'boarded' }, { status: 'flown' });
    }
    const venue = findVenue(travel.toLocationId);
    if (!venue) return;
    const city = CITIES[cityOfVenue(venue)];
    ctx.notify({
      kind: 'travel',
      title: `Welcome to ${city.name}`,
      body: travel.mode === 'flight' ? `You landed at ${venue.name}.` : `The coach pulled in at ${venue.name}.`,
      tone: 'good',
      gameMinute: travel.arriveAt,
    });
  }
}
