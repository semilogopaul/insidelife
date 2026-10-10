import { Injectable, type OnModuleInit } from '@nestjs/common';
import { actionHours, findBusinessType, type ActionDefinition } from '@insidelife/shared';
import type { ActivityState } from '../characters/entities/character.entity.js';
import type { SimulationSystem } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { BusinessAppraiser } from './business-appraiser.service.js';
import { BusinessPnlService } from './business-pnl.service.js';
import { BusinessesStore } from './businesses.store.js';

const BUSINESS_TAG = 'business';

/**
 * Businesses in the simulation: owning one unlocks the `manage-business` action, management hours feed the month's
 * results, month-end P&L moves the money, and businesses add to net worth and clout.
 */
@Injectable()
export class BusinessesSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'businesses';
  readonly order = 300;

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly store: BusinessesStore,
    private readonly pnl: BusinessPnlService,
    private readonly appraiser: BusinessAppraiser,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async itemTags(ctx: SimulationContext): Promise<readonly string[]> {
    return (await this.store.active(ctx)).length > 0 ? [BUSINESS_TAG] : [];
  }

  /** `manage-business`: hours go to the targeted business, or are split across all of them. */
  async onActionComplete(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void> {
    if (!action.hooks?.includes('manage-business')) return;
    const businesses = await this.store.active(ctx);
    if (businesses.length === 0) return;
    const minutes = Math.max(0, Math.round(actionHours(activity) * 60));
    const target = businesses.find((business) => business.id === activity.targetId);
    const recipients = target ? [target] : businesses;
    const share = Math.round(minutes / recipients.length);
    for (const business of recipients) {
      business.managementMinutesMonth += share;
      await this.store.save(ctx, business);
    }
  }

  onMonthEnd(ctx: SimulationContext, monthIndex: number): Promise<void> {
    return this.pnl.runMonth(ctx, monthIndex);
  }

  async netWorth(ctx: SimulationContext): Promise<number> {
    const businesses = await this.store.active(ctx);
    if (businesses.length === 0) return 0;
    let total = 0;
    for (const appraisal of (await this.appraiser.appraise(ctx, businesses)).values()) total += appraisal.valuation;
    return total;
  }

  async status(ctx: SimulationContext): Promise<number> {
    let total = 0;
    for (const business of await this.store.active(ctx)) total += (findBusinessType(business.typeId)?.status ?? 0) * Math.sqrt(business.units);
    return Math.round(total);
  }
}
