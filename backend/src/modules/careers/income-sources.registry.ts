import { Injectable } from '@nestjs/common';
import type { SimulationContext } from '../simulation/simulation-context.js';

/** Another domain's recurring income (business profits, rent from tenants…) counted by `EmploymentPort.monthlyIncome`. */
export interface IncomeSource {
  readonly key: string;
  /** Typical monthly income in naira (e.g. trailing average profit). */
  monthlyIncome(ctx: SimulationContext): Promise<number>;
}

/**
 * Higher-level domains (businesses) register here in `onModuleInit`, so careers can report total income without
 * importing them — the dependency arrow keeps pointing one way.
 */
@Injectable()
export class IncomeSourcesRegistry {
  private sources: readonly IncomeSource[] = [];

  register(source: IncomeSource): void {
    if (this.sources.some((existing) => existing.key === source.key)) throw new RangeError(`Income source "${source.key}" registered twice`);
    this.sources = [...this.sources, source];
  }

  get all(): readonly IncomeSource[] {
    return this.sources;
  }
}
