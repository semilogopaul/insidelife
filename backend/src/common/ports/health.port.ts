import type { SimulationContext } from '../../modules/simulation/simulation-context.js';

export type ConditionSeverity = 'mild' | 'moderate' | 'severe' | 'critical';

/** Implemented by the health module. */
export interface HealthPort {
  /** Give the character a condition (malaria, injury…) unless they already have it. */
  inflict(ctx: SimulationContext, conditionId: string, severity?: ConditionSeverity): Promise<void>;
  hasCondition(ctx: SimulationContext, conditionId: string): Promise<boolean>;
  /** Start a pregnancy (family module decides when). */
  conceive(ctx: SimulationContext, partnerName: string): Promise<void>;
  isPregnant(ctx: SimulationContext): Promise<boolean>;
}

export const HEALTH_PORT = Symbol('HEALTH_PORT');
