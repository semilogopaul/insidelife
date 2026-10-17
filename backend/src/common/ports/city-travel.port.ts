import type { SimulationContext } from '../../modules/simulation/simulation-context.js';

/**
 * Implemented by the travel module. How a character gets from one city to the other without a commercial flight: the
 * private-aviation module calls `relocateToCity` when its flight starts. Lagos ↔ Abuja is the only pair there is.
 */
export interface CityTravelPort {
  /**
   * Put the character on a flight that lands at `airportVenueId` (`mmia-gat`, `naia-gat`, `mmia-airport` or `naia-airport`:
   * any airport or aviation-terminal venue) at game minute `arriveAt`, in the other city.
   *
   * The character must be in the *other* city (the airport is where they are going), not travelling and not busy with a
   * non-interruptible activity; the call throws a `GameRuleException` otherwise. It sets the in-flight state (a `flight` timeline segment, no road travel) and
   * the normal arrival does the rest: at `arriveAt` the character stands inside `airportVenueId` and their city is
   * the airport's (settlement and snapshots handle it, nothing for the caller to do). `flightId` is an opaque label for
   * the timeline ("Challenger 350 · 5N-ABC"); `arriveAt <= ctx.time` lands them at once.
   *
   * Call it inside the character's `CharacterSession` (the ctx is that session's), after charging fuel and fees yourself
   * through `ctx.wallet` with your own deterministic idempotency keys.
   */
  relocateToCity(ctx: SimulationContext, airportVenueId: string, arriveAt: number, flightId?: string): Promise<void>;
}

export const CITY_TRAVEL_PORT = Symbol('CITY_TRAVEL_PORT');
