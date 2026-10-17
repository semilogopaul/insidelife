import { Injectable } from '@nestjs/common';
import { GameRuleException } from '../exceptions/domain.exception.js';
import type { SimulationContext } from '../../modules/simulation/simulation-context.js';

/** One private flight between two General Aviation Terminals (venue ids from docs/MULTI_CITY.md). */
export interface PrivateFlightRequest {
  /** The GAT the character is standing in (`mmia-gat` or `naia-gat`). */
  readonly fromVenueId: string;
  /** The GAT they land at. */
  readonly toVenueId: string;
  /** Game minutes the flight takes (the aircraft's cruise speed over the distance); they arrive at `ctx.time + durationMinutes`. */
  readonly durationMinutes: number;
  /** Shown to the player while they are in the air, e.g. `5N-TOL · Cessna 172 Skyhawk`. */
  readonly label: string;
}

/**
 * Moves a character between cities. Implemented by the multi-city workstream (it owns `CityId`, the Abuja districts and
 * the per-city world frame); the aviation module only asks for a private flight to another city's airport.
 *
 * Contract for the real implementation:
 * - `flyToAirport` puts the character on a trip (like a booked trip: `travel` state, arrival at `ctx.time +
 *   durationMinutes`) that ends standing in `toVenueId` in that venue's city, changing the character's city/region on
 *   arrival. It runs inside the caller's `CharacterSession` (use `ctx`; do not open another session) and must throw a
 *   `GameRuleException` when the move is impossible. It must not charge money (the aviation module already charged
 *   the fuel through the ledger, and a thrown error rolls that back).
 * - `isAirportOpen` says whether a GAT venue exists in the world and can be reached.
 */
export interface CityTravelPort {
  isAirportOpen(venueId: string): boolean;
  flyToAirport(ctx: SimulationContext, flight: PrivateFlightRequest): Promise<void>;
}

export const CITY_TRAVEL_PORT = Symbol('CITY_TRAVEL_PORT');

/**
 * Stand-in until the multi-city work lands: only Lagos exists, so no flight can leave it. After the merge, replace the
 * provider in `AviationModule` (`{ provide: CITY_TRAVEL_PORT, useClass: LagosOnlyCityTravel }`) with the multi-city
 * module's export and delete this class.
 */
@Injectable()
export class LagosOnlyCityTravel implements CityTravelPort {
  isAirportOpen(venueId: string): boolean {
    return venueId === 'mmia-gat';
  }

  flyToAirport(): Promise<void> {
    return Promise.reject(new GameRuleException('CITY_NOT_OPEN', 'Abuja’s airspace isn’t open yet. Your plane stays in Lagos for now.'));
  }
}
