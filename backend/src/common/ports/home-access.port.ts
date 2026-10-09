import type { Entrance } from '@insidelife/shared';
import type { SimulationContext } from '../../modules/simulation/simulation-context.js';

/** Implemented by the visits module: who may walk into (and ride to) someone else's home. */
export interface HomeAccessPort {
  /** The host's front door when the character has an accepted, unexpired invite to `home:<hostId>`; else null. */
  invitedDoor(ctx: SimulationContext, hostId: string): Promise<Entrance | null>;
  /** The host's front door regardless of invites (stepping out of their house). */
  doorOf(ctx: SimulationContext, hostId: string): Promise<Entrance | null>;
}

export const HOME_ACCESS_PORT = Symbol('HOME_ACCESS_PORT');
