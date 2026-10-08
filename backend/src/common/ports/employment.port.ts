import type { SimulationContext } from '../../modules/simulation/simulation-context.js';

export interface EmploymentSnapshot {
  readonly jobId: string;
  readonly title: string;
  readonly employer: string;
  readonly industry: string;
  /** Gross monthly pay in naira (USD jobs converted at the current rate). */
  readonly monthlyPayNaira: number;
  readonly yearsInRole: number;
  /** 0-1 recent attendance × performance. */
  readonly performance: number;
  readonly workplaceId: string;
}

/** Implemented by the careers module. */
export interface EmploymentPort {
  current(ctx: SimulationContext): Promise<EmploymentSnapshot | null>;
  /** Total monthly income from all jobs and businesses (for affordability checks, black tax sizing). */
  monthlyIncome(ctx: SimulationContext): Promise<number>;
}

export const EMPLOYMENT_PORT = Symbol('EMPLOYMENT_PORT');
