import { Injectable } from '@nestjs/common';
import {
  DEPOSIT_PRODUCTS,
  DEPOSIT_PRODUCT_IDS,
  MINUTES_PER_DAY,
  dayIndexOf,
  depositRate,
  formatNaira,
  formatPercent,
  simpleInterest,
  withholdingTax,
  type DepositDto,
  type DepositProductId,
  type DepositWithdrawalResultDto,
  type FixedIncomeOfferDto,
} from '@insidelife/shared';
import {
  ConflictException,
  GameRuleException,
  InsufficientFundsException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception.js';
import type { RowProbe } from '../simulation/row-presence.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { InvestmentDepositEntity } from './entities/deposit.entity.js';
import { depositDto, interestAtMaturity } from './investment.mapper.js';

export interface OpenDepositInput {
  readonly product: DepositProductId;
  readonly tenorDays: number | null;
  readonly amount: number;
}

interface Payout {
  readonly principal: number;
  readonly interest: number;
  readonly tax: number;
  readonly penalty: number;
}

const DEPOSITS_MEMO = 'investments:deposits';
/** Most characters have no fixed deposit running: the read is skipped when there's no active row (see `RowProbe`). */
export const ACTIVE_DEPOSIT_ROWS: RowProbe = { key: 'investments:deposits', table: 'investment_deposits', where: "character_id = $1 AND status = 'active'" };

/**
 * Fixed deposits and T-bills (rate locked at purchase, simple interest at maturity, early break forfeits interest and
 * costs a penalty) and the money-market fund (accrues daily at today's rate, interest paid monthly, withdraw anytime).
 * Principal moves cash ↔ `system:market` (neutral); interest is minted (earned) minus 10% WHT to `system:tax`.
 */
@Injectable()
export class DepositsService {
  active(ctx: SimulationContext): Promise<InvestmentDepositEntity[]> {
    return ctx.memo(DEPOSITS_MEMO, async () =>
      (await ctx.mayHaveRows(ACTIVE_DEPOSIT_ROWS))
        ? ctx.manager.find(InvestmentDepositEntity, { where: { characterId: ctx.character.id, status: 'active' }, order: { startedAt: 'ASC' } })
        : [],
    );
  }

  offers(ctx: SimulationContext): FixedIncomeOfferDto[] {
    const economy = ctx.world.economy(ctx.time);
    return DEPOSIT_PRODUCT_IDS.map((id) => {
      const product = DEPOSIT_PRODUCTS[id];
      const tenors: ReadonlyArray<number | null> = product.tenors.length > 0 ? product.tenors : [null];
      return {
        product: id,
        label: product.label,
        blurb: product.blurb,
        minAmount: product.minAmount,
        rates: tenors.map((tenorDays) => ({ tenorDays, annualRate: depositRate(id, tenorDays, economy) })),
        earlyBreakPenaltyRate: product.earlyBreakPenaltyRate,
      };
    });
  }

  /** Principal + interest earned so far on active deposits (net-worth hook). */
  async value(ctx: SimulationContext): Promise<number> {
    let total = 0;
    for (const deposit of await this.active(ctx)) total += deposit.principal + depositDto(deposit, ctx.time).accruedInterest;
    return total;
  }

  async open(ctx: SimulationContext, input: OpenDepositInput, idempotencyKey: string): Promise<DepositDto> {
    const product = DEPOSIT_PRODUCTS[input.product];
    const key = `deposit:${idempotencyKey}`;
    const previous = await ctx.manager.findOne(InvestmentDepositEntity, { where: { characterId: ctx.character.id, idempotencyKey: key } });
    if (previous) {
      if (previous.product !== input.product || previous.principal !== input.amount) {
        throw new ConflictException('IDEMPOTENCY_KEY_REUSED', 'That deposit key was already used for a different deposit');
      }
      return depositDto(previous, ctx.time);
    }

    const fixedTenor = product.tenors.length > 0;
    if (fixedTenor && (input.tenorDays === null || !product.tenors.includes(input.tenorDays))) {
      throw new GameRuleException('INVALID_TENOR', `${product.label} tenors: ${product.tenors.join(', ')} days`);
    }
    if (!fixedTenor && input.tenorDays !== null) throw new GameRuleException('INVALID_TENOR', `${product.label} has no fixed tenor`);
    if (input.amount < product.minAmount || input.amount > product.maxAmount) {
      throw new GameRuleException('DEPOSIT_SIZE', `${product.label}: ${formatNaira(product.minAmount)} to ${formatNaira(product.maxAmount)}`);
    }
    if (!ctx.wallet.canAfford(input.amount)) throw new InsufficientFundsException(input.amount);

    const tenorDays = fixedTenor ? input.tenorDays : null;
    const annualRate = depositRate(input.product, tenorDays, ctx.world.economy(ctx.time));
    const memo = tenorDays ? `${product.label}: ${tenorDays} days @ ${formatPercent(annualRate, 2)}` : `${product.label} @ ${formatPercent(annualRate, 2)}`;
    await ctx.wallet.pay(input.amount, 'investment', memo, key, { sink: 'market', metadata: { product: input.product, annualRate } });

    const deposit = await ctx.manager.save(
      ctx.manager.create(InvestmentDepositEntity, {
        characterId: ctx.character.id,
        idempotencyKey: key,
        product: input.product,
        principal: input.amount,
        annualRate,
        tenorDays,
        startedAt: ctx.time,
        maturesAt: tenorDays ? ctx.time + tenorDays * MINUTES_PER_DAY : null,
        accrued: 0,
        // The fund starts earning from tomorrow; today's accrual was already decided.
        lastAccrualDay: tenorDays ? null : dayIndexOf(ctx.time),
        status: 'active',
        closedAt: null,
      }),
    );
    ctx.invalidate('investments');
    return depositDto(deposit, ctx.time);
  }

  /** Player command: matured → full payout; fixed tenor before maturity → break (penalty, interest forfeited); fund → withdraw. */
  async withdraw(ctx: SimulationContext, depositId: string): Promise<DepositWithdrawalResultDto> {
    const deposit = await ctx.manager.findOne(InvestmentDepositEntity, {
      where: { id: depositId, characterId: ctx.character.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!deposit) throw new ResourceNotFoundException('Deposit');
    if (deposit.status !== 'active') throw new ConflictException('DEPOSIT_CLOSED', 'That deposit is already closed');

    let payout: Payout;
    if (deposit.maturesAt !== null && ctx.time < deposit.maturesAt) payout = await this.breakEarly(ctx, deposit);
    else payout = await this.payOut(ctx, deposit, deposit.maturesAt === null ? 'withdrawn' : 'matured');
    ctx.invalidate('investments');
    return {
      deposit: depositDto(deposit, ctx.time),
      principalReturned: payout.principal - payout.penalty,
      interestPaid: payout.interest,
      withholdingTax: payout.tax,
      penalty: payout.penalty,
      cashBalance: ctx.wallet.cash,
    };
  }

  /** Simulation (day end): accrue the fund, pay out fixed deposits that matured. */
  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const deposits = await this.active(ctx);
    if (deposits.length === 0) return;
    const endOfDay = (dayIndex + 1) * MINUTES_PER_DAY;
    let changed = false;
    for (const deposit of deposits) {
      if (deposit.status !== 'active') continue;
      if (deposit.maturesAt === null) {
        if (deposit.lastAccrualDay !== null && deposit.lastAccrualDay >= dayIndex) continue;
        const rate = ctx.world.economy(dayIndex * MINUTES_PER_DAY).moneyMarketRate;
        deposit.accrued += simpleInterest(deposit.principal, rate, 1);
        deposit.annualRate = rate;
        deposit.lastAccrualDay = dayIndex;
        await ctx.manager.save(deposit);
      } else if (deposit.maturesAt <= endOfDay) {
        const payout = await this.payOut(ctx, deposit, 'matured');
        changed = true;
        ctx.report({ label: `${DEPOSIT_PRODUCTS[deposit.product].label} matured`, amount: payout.principal + payout.interest - payout.tax, tone: 'good' });
        ctx.notify({
          kind: 'investment',
          title: `${DEPOSIT_PRODUCTS[deposit.product].label} matured`,
          body: `${formatNaira(payout.principal)} back plus ${formatNaira(payout.interest - payout.tax)} interest (after 10% WHT).`,
          tone: 'good',
          amount: payout.principal + payout.interest - payout.tax,
        });
      }
    }
    if (changed) ctx.invalidate('investments');
  }

  /** Simulation (month end): pay the fund's accrued interest to cash. */
  async onMonthEnd(ctx: SimulationContext, monthIndex: number): Promise<void> {
    for (const deposit of await this.active(ctx)) {
      if (deposit.status !== 'active' || deposit.maturesAt !== null) continue;
      const gross = Math.floor(deposit.accrued);
      if (gross <= 0) continue;
      const tax = withholdingTax(gross);
      await ctx.wallet.receive(gross, 'interest', 'Money-market fund interest', `mmf:${deposit.id}:${monthIndex}`, { income: 'earned' });
      await ctx.wallet.tryPay(tax, 'tax', 'Withholding tax on fund interest', `mmf-wht:${deposit.id}:${monthIndex}`, { sink: 'tax' });
      deposit.accrued -= gross;
      deposit.interestPaid += gross;
      deposit.withholdingTax += tax;
      await ctx.manager.save(deposit);
      ctx.report({ label: 'Money-market interest', amount: gross - tax, tone: 'good' });
    }
  }

  private async breakEarly(ctx: SimulationContext, deposit: InvestmentDepositEntity): Promise<Payout> {
    const product = DEPOSIT_PRODUCTS[deposit.product];
    const penalty = Math.round(deposit.principal * product.earlyBreakPenaltyRate);
    await ctx.wallet.receive(deposit.principal, 'investment', `${product.label} broken early`, `deposit:${deposit.id}:principal`, {
      income: 'neutral',
      source: 'market',
    });
    await ctx.wallet.pay(penalty, 'fee', `${product.label} early-break charge`, `deposit:${deposit.id}:penalty`, { sink: 'fees' });
    deposit.status = 'broken';
    deposit.closedAt = ctx.time;
    deposit.penalty = penalty;
    await ctx.manager.save(deposit);
    return { principal: deposit.principal, interest: 0, tax: 0, penalty };
  }

  private async payOut(ctx: SimulationContext, deposit: InvestmentDepositEntity, status: 'matured' | 'withdrawn'): Promise<Payout> {
    const label = DEPOSIT_PRODUCTS[deposit.product].label;
    const interest = deposit.tenorDays === null ? Math.floor(deposit.accrued) : (interestAtMaturity(deposit) ?? 0);
    const tax = withholdingTax(interest);
    await ctx.wallet.receive(deposit.principal, 'investment', `${label} principal returned`, `deposit:${deposit.id}:principal`, {
      income: 'neutral',
      source: 'market',
    });
    await ctx.wallet.receive(interest, 'interest', `${label} interest`, `deposit:${deposit.id}:interest`, { income: 'earned' });
    await ctx.wallet.tryPay(tax, 'tax', `Withholding tax on ${label.toLowerCase()} interest`, `deposit:${deposit.id}:wht`, { sink: 'tax' });
    deposit.status = status;
    deposit.closedAt = ctx.time;
    deposit.interestPaid += interest;
    deposit.withholdingTax += tax;
    deposit.accrued = 0;
    await ctx.manager.save(deposit);
    return { principal: deposit.principal, interest, tax, penalty: 0 };
  }
}
