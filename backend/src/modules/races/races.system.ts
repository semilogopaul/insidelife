import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { TravelState } from '../characters/entities/character.entity.js';
import type { SimulationSystem } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { RACE_LIVE_ROWS, RACE_UNCLAIMED_ROWS, RacesService } from './races.service.js';

/**
 * Races in the simulation. A racer finishes in the trip-arrival hook (`onArrival`: the same path every flight, coach and
 * ride lands through, so there is no polling); every settle lapses stale challenges, ends races whose days ran out and
 * records the winner's badge signal.
 */
@Injectable()
export class RacesSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'races';
  /** After the travel system (120), which has already welcomed the traveller to the city. */
  readonly order = 125;
  readonly rowProbes = [RACE_LIVE_ROWS, RACE_UNCLAIMED_ROWS];

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly races: RacesService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  onArrival(ctx: SimulationContext, travel: TravelState): Promise<void> {
    return this.races.onArrival(ctx, travel);
  }

  onSettled(ctx: SimulationContext): Promise<void> {
    return this.races.onSettled(ctx);
  }
}
