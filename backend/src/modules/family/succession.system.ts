import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { LedgerService } from '../ledger/ledger.service.js';
import type { SimulationSystem } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { SuccessionService } from './services/succession.service.js';

/**
 * Runs the succession after every other domain has handled the death (liquidations, property, pensions), so the
 * estate the heir inherits is final. Separate from `FamilySystem` only because it must run last.
 */
@Injectable()
export class SuccessionSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'family-succession';
  readonly order = 990;
  private readonly logger = new Logger(SuccessionSystem.name);

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly succession: SuccessionService,
    private readonly ledger: LedgerService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  /**
   * Runs in a savepoint: if succession fails, the death still settles (the player starts a new life) instead of
   * every future request failing on the same death.
   */
  async onDeath(ctx: SimulationContext): Promise<void> {
    try {
      await ctx.manager.transaction(() => this.succession.succeed(ctx));
    } catch (error) {
      this.logger.error({ err: error, characterId: ctx.character.id }, 'Succession failed; the line ends here');
      const balances = await this.ledger.balances(ctx.manager, ctx.character.id);
      ctx.wallet.sync(new Map([[ctx.wallet.accounts.cash, balances.cash]]));
    }
  }
}
