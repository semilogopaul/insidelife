import { Injectable } from '@nestjs/common';
import { In, Not } from 'typeorm';
import type { RowProbe } from '../simulation/row-presence.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { BusinessPnlEntity } from './entities/business-pnl.entity.js';
import { BusinessEntity } from './entities/business.entity.js';

const ACTIVE_MEMO = 'businesses:active';
const HISTORY_MONTHS = 12;
/** Most characters run no business: the read is skipped when there's no active one (see `RowProbe`). */
export const ACTIVE_BUSINESS_ROWS: RowProbe = { key: 'businesses:active', table: 'businesses', where: "character_id = $1 AND status = 'active'" };

/** Persistence for the businesses domain, scoped to the locked character and memoised per transaction. */
@Injectable()
export class BusinessesStore {
  active(ctx: SimulationContext): Promise<BusinessEntity[]> {
    return ctx.memo(ACTIVE_MEMO, async () =>
      (await ctx.mayHaveRows(ACTIVE_BUSINESS_ROWS))
        ? ctx.manager.find(BusinessEntity, { where: { characterId: ctx.character.id, status: 'active' }, order: { openedAt: 'ASC' } })
        : [],
    );
  }

  forget(ctx: SimulationContext): void {
    ctx.invalidate(ACTIVE_MEMO);
  }

  /** Recently sold, closed or folded businesses (for the history list). */
  past(ctx: SimulationContext, limit = 5): Promise<BusinessEntity[]> {
    return ctx.manager.find(BusinessEntity, {
      where: { characterId: ctx.character.id, status: Not('active') },
      order: { closedAt: 'DESC' },
      take: limit,
    });
  }

  async owned(ctx: SimulationContext, id: string): Promise<BusinessEntity | null> {
    return ctx.manager.findOne(BusinessEntity, { where: { id, characterId: ctx.character.id } });
  }

  create(ctx: SimulationContext, values: Partial<BusinessEntity>): BusinessEntity {
    return ctx.manager.create(BusinessEntity, { ...values, characterId: ctx.character.id });
  }

  async save(ctx: SimulationContext, business: BusinessEntity): Promise<BusinessEntity> {
    return ctx.manager.save(business);
  }

  async pnlExists(ctx: SimulationContext, businessId: string, monthIndex: number): Promise<boolean> {
    return ctx.manager.exists(BusinessPnlEntity, { where: { businessId, monthIndex } });
  }

  async savePnl(ctx: SimulationContext, values: Omit<BusinessPnlEntity, 'id' | 'createdAt' | 'characterId'>): Promise<void> {
    await ctx.manager.save(ctx.manager.create(BusinessPnlEntity, { ...values, characterId: ctx.character.id }));
  }

  /** Last 12 monthly results per business, oldest first. */
  async recentPnl(ctx: SimulationContext, businessIds: readonly string[]): Promise<Map<string, BusinessPnlEntity[]>> {
    const byBusiness = new Map<string, BusinessPnlEntity[]>();
    if (businessIds.length === 0) return byBusiness;
    const rows = await ctx.manager.find(BusinessPnlEntity, {
      where: { characterId: ctx.character.id, businessId: In([...businessIds]) },
      order: { monthIndex: 'DESC' },
      take: HISTORY_MONTHS * businessIds.length,
    });
    for (const row of rows.toReversed()) {
      const list = byBusiness.get(row.businessId) ?? [];
      list.push(row);
      byBusiness.set(row.businessId, list.slice(-HISTORY_MONTHS));
    }
    return byBusiness;
  }
}
