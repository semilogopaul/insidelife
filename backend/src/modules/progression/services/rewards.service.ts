import { Inject, Injectable, Logger } from '@nestjs/common';
import { formatNaira, type LifeGoalDefinition, type LifeGoalReward } from '@insidelife/shared';
import { INVENTORY_PORT, type InventoryPort } from '../../../common/ports/inventory.port.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import type { ProgressionProfileEntity } from '../entities/progression-profile.entity.js';
import { ProfilesService } from './profiles.service.js';

export interface GrantedReward {
  readonly cash: number;
  readonly clout: number;
  /** Label of the item actually granted, if any. */
  readonly item: string | null;
}

/**
 * Pays Life Goal rewards: small earned cash through the ledger (idempotent per goal), permanent capped clout and,
 * optionally, an item through the inventory port. Rewards are nudges, never a salary.
 */
@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    private readonly profiles: ProfilesService,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
  ) {}

  async grantGoal(ctx: SimulationContext, profile: ProgressionProfileEntity, goal: LifeGoalDefinition, bonusMet: boolean): Promise<GrantedReward> {
    const bonus = bonusMet ? goal.bonus : undefined;
    const cash = goal.reward.cash + (bonus?.cash ?? 0);
    if (cash > 0) {
      await ctx.wallet.receive(cash, 'event-reward', `Life Goal: ${goal.title}`, `goal:${goal.id}`, {
        income: 'earned',
        metadata: { goalId: goal.id, bonus: bonus !== undefined },
      });
    }
    const clout = await this.profiles.addClout(ctx, profile, goal.reward.clout + (bonus?.clout ?? 0));
    const item = goal.reward.item ? await this.grantItem(ctx, goal.reward.item) : null;
    return { cash, clout, item };
  }

  /** "+₦5,000 · +1 clout · Standing fan" */
  describe(granted: GrantedReward): string {
    const parts: string[] = [];
    if (granted.cash > 0) parts.push(`+${formatNaira(granted.cash)}`);
    if (granted.clout > 0) parts.push(`+${granted.clout} clout`);
    if (granted.item) parts.push(granted.item);
    return parts.join(' · ');
  }

  /**
   * Items are best-effort: the grant runs in a savepoint so an unknown item id can never poison the player's
   * settle transaction; the reward line simply omits the item.
   */
  private async grantItem(ctx: SimulationContext, item: NonNullable<LifeGoalReward['item']>): Promise<string | null> {
    try {
      await ctx.manager.transaction(async () => {
        await this.inventory.grant(ctx, item.itemId, 1);
      });
      return item.label;
    } catch (error) {
      // Deliberately broad: a reward item must never break the settle that earned it.
      this.logger.warn({ characterId: ctx.character.id, itemId: item.itemId, err: error }, 'Life Goal item reward failed');
      return null;
    }
  }
}
