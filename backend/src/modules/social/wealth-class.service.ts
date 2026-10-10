import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { bankMoneyOf, wealthClass, type WealthClass } from '@insidelife/shared';
import { WorldService } from '../world/world.service.js';

/**
 * SQL columns that put a character's bank money on a row (`c` = characters): cash + savings in naira and the USD
 * account in cents. Pension doesn't count. Turn the row into a class with `wealthClassOfRow`.
 */
export const WEALTH_COLUMNS = `
  (SELECT COALESCE(SUM(a.balance) FILTER (WHERE a.kind IN ('cash', 'savings')), 0) FROM ledger_accounts a WHERE a.owner_id = c.id) AS bank_naira,
  (SELECT COALESCE(SUM(a.balance) FILTER (WHERE a.kind = 'usd'), 0) FROM ledger_accounts a WHERE a.owner_id = c.id) AS bank_usd_cents`;

export interface WealthRow {
  readonly bank_naira?: string | number | null;
  readonly bank_usd_cents?: string | number | null;
}

export function wealthClassOfRow(row: WealthRow, usdRate: number): WealthClass {
  return wealthClass(bankMoneyOf({ cash: Number(row.bank_naira ?? 0), savings: 0, usdCents: Number(row.bank_usd_cents ?? 0) }, usdRate));
}

/**
 * Nepo (gold) or lapo (blue) for any characters, computed from their bank money. Only the class leaves the server —
 * never the amount.
 */
@Injectable()
export class WealthClassService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly world: WorldService,
  ) {}

  async classes(ids: readonly string[], manager: EntityManager = this.dataSource.manager): Promise<Map<string, WealthClass>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows: Array<WealthRow & { id: string }> = await manager.query(
      `SELECT c.id, ${WEALTH_COLUMNS} FROM characters c WHERE c.id = ANY($1::uuid[])`,
      [unique],
    );
    const usdRate = this.world.economy(this.world.now()).usdRate;
    return new Map(rows.map((row) => [row.id, wealthClassOfRow(row, usdRate)]));
  }

  async classOf(id: string, manager?: EntityManager): Promise<WealthClass> {
    return (await this.classes([id], manager)).get(id) ?? 'lapo';
  }
}
