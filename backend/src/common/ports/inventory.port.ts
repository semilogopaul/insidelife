import type { SimulationContext } from '../../modules/simulation/simulation-context.js';

export interface OwnedItem {
  readonly id: string;
  readonly itemId: string;
  readonly quantity: number;
}

export type PowerBackup = 'none' | 'generator' | 'inverter' | 'solar';

/** What the character's belongings add to home life. */
export interface HomeComfortBonus {
  /** 0-15 extra comfort from furniture and appliances. */
  readonly comfort: number;
  /** 0-1 sleep quality from the best bed owned. */
  readonly bedQuality: number;
  /** Best power backup owned (NEPA mitigation). */
  readonly power: PowerBackup;
}

/** Implemented by the shop module (items, furniture, gadgets, clothing). */
export interface InventoryPort {
  homeComfortBonus(ctx: SimulationContext): Promise<HomeComfortBonus>;
  owned(ctx: SimulationContext): Promise<readonly OwnedItem[]>;
  hasTag(ctx: SimulationContext, tag: string): Promise<boolean>;
  /** Give an item (starter kit, event reward). */
  grant(ctx: SimulationContext, itemId: string, quantity?: number): Promise<void>;
  /** Remove one owned item carrying `tag` (phone snatched). Returns the removed catalog item id. */
  takeByTag(ctx: SimulationContext, tag: string): Promise<string | null>;
}

export const INVENTORY_PORT = Symbol('INVENTORY_PORT');
