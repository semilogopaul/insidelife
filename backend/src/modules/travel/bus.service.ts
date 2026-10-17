import { Injectable } from '@nestjs/common';
import { CITIES, findVenue, isInterruptibleActivity, otherCity, type CityId } from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { FlightsService } from './flights.service.js';

/** The Lagos ↔ Abuja interstate coach: slow (~10 game hours) and cheap, from the city's motor park to the other's. */
@Injectable()
export class BusService {
  constructor(private readonly flights: FlightsService) {}

  /** Board the coach to the other city. You must be standing at this city's motor park. */
  async book(ctx: SimulationContext, toCity: CityId): Promise<void> {
    const character = ctx.character;
    if (!character.alive) throw new GameRuleException('DECEASED', 'This character has passed on');
    const city = character.cityId;
    if (toCity !== otherCity(city)) throw new GameRuleException('SAME_CITY', `You’re already in ${CITIES[city].name}`);
    const offer = this.flights.busOffer(ctx);
    const station = CITIES[city].busStationVenueId;
    if (character.locationId !== station || character.travel) {
      throw new GameRuleException('NOT_AT_STATION', `The coach to ${CITIES[toCity].name} leaves from ${findVenue(station)?.name ?? 'the motor park'}. Get there first.`);
    }
    if (character.activity && !isInterruptibleActivity(character.activity)) throw new GameRuleException('BUSY', 'Finish or cancel what you’re doing first');

    await ctx.wallet.pay(offer.fare, 'transport', `Interstate coach to ${CITIES[toCity].name}`, `bus:${ctx.time}:${toCity}`);
    character.activity = null;
    character.travel = {
      fromLocationId: station,
      toLocationId: CITIES[toCity].busStationVenueId,
      mode: 'coach',
      departAt: ctx.time,
      arriveAt: ctx.time + offer.minutes,
      fare: offer.fare,
      explicit: true,
    };
  }
}
