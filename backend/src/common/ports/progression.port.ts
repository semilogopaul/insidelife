import type { ProgressionSignal } from '@insidelife/shared';
import type { SimulationContext } from '../../modules/simulation/simulation-context.js';

/**
 * Lets other domains report facts only they can see (an owambe spray, an accepted friend request, black tax paid)
 * so achievements and Life Goals can react. Call it inside the same `CharacterSession` transaction as the fact.
 * The provider is global (`ProgressionCountersModule`), so domains inject it without importing progression.
 */
export interface ProgressionSignalsPort {
  /** Count one occurrence and, when given, add `amount` naira to the signal's running total. */
  record(ctx: SimulationContext, signal: ProgressionSignal, amount?: number): Promise<void>;
}

export const PROGRESSION_SIGNALS_PORT = Symbol('PROGRESSION_SIGNALS_PORT');
