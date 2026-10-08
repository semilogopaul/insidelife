import { Injectable } from '@nestjs/common';
import { dayIndexOf, fxRates, type PortfolioDto } from '@insidelife/shared';
import { LedgerService } from '../ledger/ledger.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { DepositsService } from './deposits.service.js';
import { PonziStakeEntity } from './entities/ponzi-stake.entity.js';
import { FxAllowanceService } from './fx-allowance.service.js';
import { depositDto, holdingDto, ponziDto } from './investment.mapper.js';
import { MarketDataService } from './market-data.service.js';
import { SavingsInterestService } from './savings-interest.service.js';
import { TradingService } from './trading.service.js';

const RECENT_SCHEMES = 10;

/** The Invest app's home screen: every balance and position valued at today's prices. */
@Injectable()
export class PortfolioService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly market: MarketDataService,
    private readonly trading: TradingService,
    private readonly deposits: DepositsService,
    private readonly savings: SavingsInterestService,
    private readonly allowance: FxAllowanceService,
  ) {}

  /** Investment assets for net worth: holdings at market value + active deposits (principal + interest so far). */
  async assetValue(ctx: SimulationContext): Promise<number> {
    return (await this.trading.holdingsValue(ctx)) + (await this.deposits.value(ctx));
  }

  async build(ctx: SimulationContext): Promise<PortfolioDto> {
    const day = dayIndexOf(ctx.time);
    const economy = ctx.world.economy(ctx.time);
    const balances = await this.ledger.balances(ctx.manager, ctx.character.id);
    const accrual = await this.savings.accrual(ctx);
    const holdings = (await this.trading.holdings(ctx)).map((holding) => holdingDto(holding, this.market.price(holding.instrumentId, day)));
    const deposits = (await this.deposits.active(ctx)).map((deposit) => depositDto(deposit, ctx.time));
    const schemes = await ctx.manager.find(PonziStakeEntity, {
      where: { characterId: ctx.character.id },
      order: { joinedAt: 'DESC' },
      take: RECENT_SCHEMES,
    });
    const rates = fxRates(economy.usdRate);
    const usdValue = Math.round((balances.usd / 100) * economy.usdRate);
    const holdingsValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
    const depositsValue = deposits.reduce((sum, deposit) => sum + deposit.principal + deposit.accruedInterest, 0);

    return {
      asOf: ctx.time,
      cash: balances.cash,
      savings: { balance: balances.savings, annualRate: economy.savingsRate, accruedInterest: Math.floor(accrual?.accrued ?? 0) },
      usd: {
        balanceCents: balances.usd,
        midRate: economy.usdRate,
        buyRate: rates.buyKobo / 100,
        sellRate: rates.sellKobo / 100,
        nairaValue: usdValue,
        allowanceRemainingCents: await this.allowance.remainingCents(ctx),
      },
      holdings,
      deposits,
      ponzi: schemes.map(ponziDto),
      offers: this.deposits.offers(ctx),
      totals: {
        holdingsValue,
        depositsValue,
        usdValue,
        savings: balances.savings,
        total: balances.cash + balances.savings + usdValue + holdingsValue + depositsValue,
      },
    };
  }
}
