import { Injectable, type OnModuleInit } from '@nestjs/common';
import type {
  SimulationSystem,
  SummaryContribution,
} from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { BettingService } from './betting.service.js';

/**
 * Betting over time: slips whose matches are over settle in the bettor's own session (every settle, after the other
 * domains), and winnings land in their wallet once. Runs late so the day's bills come out first.
 */
@Injectable()
export class BettingSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'betting';
  readonly order = 850;

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly betting: BettingService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async onSettled(ctx: SimulationContext): Promise<void> {
    await this.betting.settleDue(ctx);
  }

  /**
   * Snapshots claim them too: a refetch in the same game minute as full time has nothing to settle (the engine skips
   * `onSettled`), but the bettor should see the win at once.
   */
  async summarize(ctx: SimulationContext): Promise<SummaryContribution> {
    await this.betting.settleDue(ctx);
    return {};
  }
}
