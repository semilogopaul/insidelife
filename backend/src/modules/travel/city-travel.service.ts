import { Injectable } from '@nestjs/common';
import { cityOfVenue, findVenue, isInterruptibleActivity } from '@insidelife/shared';
import type { CityTravelPort } from '../../common/ports/city-travel.port.js';
import { GameRuleException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { SimulationEngine } from '../simulation/simulation-engine.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';

/** Airport venue types a flight can land at. */
const AIRPORT_TYPES: ReadonlySet<string> = new Set(['airport', 'aviation-terminal']);

/**
 * `CITY_TRAVEL_PORT`: what other modules (private aviation) call when a flight between the cities starts. It does not
 * charge anything: the caller has already charged fuel and fees itself.
 */
@Injectable()
export class CityTravelService implements CityTravelPort {
  constructor(private readonly engine: SimulationEngine) {}

  async relocateToCity(ctx: SimulationContext, airportVenueId: string, arriveAt: number, flightId?: string): Promise<void> {
    const venue = findVenue(airportVenueId);
    if (!venue || !AIRPORT_TYPES.has(venue.type)) throw new ResourceNotFoundException('Airport');
    const character = ctx.character;
    if (!character.alive) throw new GameRuleException('DECEASED', 'This character has passed on');
    if (character.travel) throw new GameRuleException('TRAVELLING', 'You’re already on the move');
    if (character.activity && !isInterruptibleActivity(character.activity)) throw new GameRuleException('BUSY', 'Finish or cancel what you’re doing first');
    if (cityOfVenue(venue) === character.cityId) throw new GameRuleException('SAME_CITY', 'That airport is in the city you’re already in');

    character.activity = null;
    if (arriveAt <= ctx.time) {
      await this.engine.landAt(ctx, airportVenueId, flightId);
      return;
    }
    character.travel = {
      fromLocationId: character.locationId,
      toLocationId: airportVenueId,
      mode: 'flight',
      ...(flightId ? { flightId } : {}),
      departAt: ctx.time,
      arriveAt,
      fare: 0,
      explicit: true,
    };
  }
}
