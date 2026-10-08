import { Injectable } from '@nestjs/common';
import { dailyTransferLimit, transferTierFor, type TransferTier } from '@insidelife/shared';
import { LedgerService } from '../ledger/ledger.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { UsersService } from '../users/users.service.js';
import { WorldService } from '../world/world.service.js';
import { startOfUtcDay } from './utc-day.js';
import { characterAgeDays } from './transfer-rules.js';

export interface TransferLimits {
  readonly tier: TransferTier;
  readonly dailyLimit: number;
  /** Debited by transfers (amount + charges) since 00:00 UTC today. */
  readonly sentToday: number;
  readonly characterAgeDays: number;
  readonly emailVerified: boolean;
}

/** KYC-style transfer tiers: character age in game days + verified email → daily limit. */
@Injectable()
export class TransferLimitsService {
  constructor(
    private readonly users: UsersService,
    private readonly world: WorldService,
    private readonly ledger: LedgerService,
  ) {}

  async limitsFor(ctx: SimulationContext, now: Date = new Date()): Promise<TransferLimits> {
    const character = ctx.character;
    const user = await this.users.findById(character.userId);
    const emailVerified = Boolean(user?.emailVerifiedAt);
    const ageDays = characterAgeDays(this.world.now(character.createdAt.getTime()), ctx.time);
    const tier = transferTierFor(ageDays, emailVerified);
    const sentToday = await this.ledger.sumOutflowSince(ctx.manager, character.id, 'transfer', startOfUtcDay(now));
    return { tier, dailyLimit: dailyTransferLimit(tier), sentToday, characterAgeDays: ageDays, emailVerified };
  }
}
