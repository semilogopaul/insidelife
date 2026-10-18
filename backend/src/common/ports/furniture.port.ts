import type { FurniturePurchaseDto } from '@insidelife/shared';
import type { SimulationContext } from '../../modules/simulation/simulation-context.js';

/** Where the player is when furniture arrives: the room of their home they are in, if any. */
export interface FurnitureHint {
  readonly roomId?: string | null;
}

/**
 * Implemented by the decor module (which owns where furniture stands). The shop tells it when units of a furniture
 * product arrive or leave the inventory, and asks which owned furniture is actually in the home (a bed in storage
 * doesn't sleep you). Looked up lazily (`ModuleRef`) so the shop doesn't import the decor module: housing consumes the
 * shop and decor consumes housing.
 */
export interface FurniturePort {
  /** `units` of a furniture product joined stack `stack`: make a piece of each and put them in the home where they fit. */
  acquired(ctx: SimulationContext, stack: { readonly id: string; readonly itemId: string }, units: number, hint?: FurnitureHint): Promise<FurniturePurchaseDto>;
  /** `units` left the stack (sold, stolen): their pieces go too (stored ones first). */
  released(ctx: SimulationContext, stackId: string, units: number): Promise<void>;
  /**
   * The furniture stacks that count in the home right now (at least one piece standing in it), or null when every
   * stack counts: homes that come furnished (the family house, hostels) use what the family provides.
   */
  countedStacks(ctx: SimulationContext): Promise<ReadonlySet<string> | null>;
  /** The sleep quality of the best decor bed standing in the home (decor beds are beds too), or null. */
  decorBedQuality(ctx: SimulationContext): Promise<number | null>;
}

export const FURNITURE_PORT = Symbol('FURNITURE_PORT');
