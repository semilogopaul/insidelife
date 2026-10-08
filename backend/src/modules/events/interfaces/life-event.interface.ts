import type { SimulationContext } from '../../simulation/simulation-context.js';

/** Values rolled when the event fires, frozen so the card shows exactly what will be charged/paid. */
export type LifeEventParams = Readonly<Record<string, string | number | boolean>>;

export interface LifeEventOutcome {
  readonly title: string;
  readonly body: string;
  readonly tone: 'good' | 'bad' | 'neutral';
  /** Net money change for the outcome card (the choice performs the actual ledger postings). */
  readonly moneyDelta?: number;
}

export interface LifeEventChoice {
  readonly id: string;
  readonly label: (params: LifeEventParams) => string;
  readonly hint?: (params: LifeEventParams) => string | undefined;
  /** Return a reason string to disable the choice (e.g. can't afford it). */
  readonly unavailable?: (ctx: SimulationContext, params: LifeEventParams) => Promise<string | null> | string | null;
  /** Apply the consequences. Use ctx.wallet for money, ctx.rng for luck. */
  readonly resolve: (ctx: SimulationContext, params: LifeEventParams) => Promise<LifeEventOutcome>;
}

/**
 * A life event card. Domains register definitions with `LifeEventsRegistry`; the engine rolls at most one new event
 * per game day (deterministically), and unanswered events auto-resolve to `defaultChoiceId` when they expire.
 */
export interface LifeEventDefinition {
  readonly id: string;
  /** Which domain owns it (for analytics and tuning). */
  readonly domain: string;
  /** Emoji or art key shown on the card. */
  readonly art: string;
  readonly weight: number;
  /** Don't fire again within this many game days. */
  readonly cooldownDays: number;
  /** Game minutes the player has to decide (default 1 game day ≈ 12 real minutes). */
  readonly expiresIn?: number;
  readonly eligible: (ctx: SimulationContext) => Promise<boolean> | boolean;
  /** Roll parameters (amounts, names) when the event fires. */
  readonly prepare?: (ctx: SimulationContext) => Promise<LifeEventParams> | LifeEventParams;
  readonly title: (params: LifeEventParams) => string;
  readonly body: (params: LifeEventParams) => string;
  readonly choices: readonly LifeEventChoice[];
  readonly defaultChoiceId: string;
}
