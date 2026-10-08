import { Injectable } from '@nestjs/common';
import { FX_MONTHLY_ALLOWANCE_USD_CENTS, MICRO_UNITS_PER_UNIT, formatNaira, startOfMonth } from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { FX_INSTRUMENT_ID } from './entities/trade.entity.js';

/** USDT is a dollar: one micro-unit is 1/10,000 of a cent. */
const USDT_ID = 'USDT';
const MICRO_UNITS_PER_CENT = MICRO_UNITS_PER_UNIT / 100;

/**
 * CBN-style monthly FX allowance shared by the dollar desk and USDT. The FX rate follows a public world schedule, so
 * without a cap anyone who reads the schedule could farm its swings with unlimited capital.
 */
@Injectable()
export class FxAllowanceService {
  /** Dollars (in cents) bought this game month via the desk or USDT. */
  async usedCents(ctx: SimulationContext): Promise<number> {
    const rows = (await ctx.manager.query(
      `SELECT COALESCE(SUM(CASE WHEN instrument_id = $2 THEN quantity ELSE CEIL(quantity::numeric / $4) END), 0) AS cents
         FROM investment_trades
        WHERE character_id = $1 AND game_minute >= $5
          AND ((instrument_id = $2 AND side = 'buy-usd') OR (instrument_id = $3 AND side = 'buy'))`,
      [ctx.character.id, FX_INSTRUMENT_ID, USDT_ID, MICRO_UNITS_PER_CENT, startOfMonth(ctx.time)],
    )) as Array<{ cents: string }>;
    return Number(rows[0]?.cents ?? 0);
  }

  async remainingCents(ctx: SimulationContext): Promise<number> {
    return Math.max(0, FX_MONTHLY_ALLOWANCE_USD_CENTS - (await this.usedCents(ctx)));
  }

  async assertWithin(ctx: SimulationContext, cents: number, usdRate: number): Promise<void> {
    const remaining = await this.remainingCents(ctx);
    if (cents <= remaining) return;
    throw new GameRuleException(
      'FX_ALLOWANCE_EXCEEDED',
      `CBN allows $${FX_MONTHLY_ALLOWANCE_USD_CENTS / 100} of dollars per month. You have $${(remaining / 100).toFixed(2)} (≈${formatNaira((remaining / 100) * usdRate)}) left this month.`,
    );
  }

  /** USD cents a USDT position of `microUnits` represents. */
  static usdtCents(microUnits: number): number {
    return Math.ceil(microUnits / MICRO_UNITS_PER_CENT);
  }

  static isDollarProxy(instrumentId: string): boolean {
    return instrumentId === USDT_ID;
  }
}
