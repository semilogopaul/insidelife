import type { SimulationContext } from '../../modules/simulation/simulation-context.js';

/**
 * Implemented by the decor module. The private-aviation module tells it when an aircraft leaves its owner's hands, so
 * the cabin decor fitted in it goes back to the owner's decor inventory (nothing is lost with the sale).
 */
export interface AircraftDecorPort {
  /**
   * Put every piece fitted in `aircraftId` back in the owner's inventory. Call it inside the owner's `CharacterSession`
   * (the ctx is that session's), before the aircraft row is deleted. Returns how many pieces came out.
   */
  releaseAircraft(ctx: SimulationContext, aircraftId: string): Promise<number>;
}

export const AIRCRAFT_DECOR_PORT = Symbol('AIRCRAFT_DECOR_PORT');
