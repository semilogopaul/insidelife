import { Injectable } from '@nestjs/common';
import { MINUTES_PER_DAY, formatNaira, simpleInterest, withholdingTax } from '@insidelife/shared';
import { LedgerService } from '../ledger/ledger.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SavingsAccrualEntity } from './entities/savings-accrual.entity.js';

const ACCRUAL_MEMO = 'investments:savings-accrual';

/**
 * Savings-account interest: accrued every day on the end-of-day savings balance at that day's `economy.savingsRate`,
 * paid into savings at month end minus 10% withholding tax. Fractions carry over to the next month.
 */
@Injectable()
export class SavingsInterestService {
  constructor(private readonly ledger: LedgerService) {}

  accrual(ctx: SimulationContext): Promise<SavingsAccrualEntity | null> {
    return ctx.memo(ACCRUAL_MEMO, () => ctx.manager.findOne(SavingsAccrualEntity, { where: { characterId: ctx.character.id } }));
  }

  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const { savings } = await this.ledger.balances(ctx.manager, ctx.character.id);
    if (savings <= 0) return;
    const existing = await this.accrual(ctx);
    if (existing && existing.lastAccrualDay >= dayIndex) return;
    const rate = ctx.world.economy(dayIndex * MINUTES_PER_DAY).savingsRate;
    const row = existing ?? ctx.manager.create(SavingsAccrualEntity, { characterId: ctx.character.id, accrued: 0, lastAccrualDay: dayIndex });
    row.accrued += simpleInterest(savings, rate, 1);
    row.lastAccrualDay = dayIndex;
    await ctx.manager.save(row);
    if (!existing) {
      ctx.invalidate(ACCRUAL_MEMO);
    }
  }

  async onMonthEnd(ctx: SimulationContext, monthIndex: number): Promise<void> {
    const row = await this.accrual(ctx);
    if (!row) return;
    const gross = Math.floor(row.accrued);
    if (gross <= 0) return;
    const tax = withholdingTax(gross);
    await ctx.wallet.receive(gross, 'interest', 'Savings interest', `savings-interest:${monthIndex}`, { income: 'earned', account: 'savings' });
    await ctx.wallet.tryPay(tax, 'tax', 'Withholding tax on savings interest', `savings-wht:${monthIndex}`, { account: 'savings', sink: 'tax' });
    row.accrued -= gross;
    await ctx.manager.save(row);
    ctx.report({ label: 'Savings interest', amount: gross - tax, tone: 'good' });
    if (gross - tax >= 1_000) {
      ctx.notify({
        kind: 'investment',
        title: 'Savings interest paid',
        body: `${formatNaira(gross - tax)} added to your savings (after 10% withholding tax).`,
        tone: 'good',
        amount: gross - tax,
      });
    }
  }
}
