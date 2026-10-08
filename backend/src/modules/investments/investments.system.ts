import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { SimulationSystem } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { DepositsService } from './deposits.service.js';
import { PonziService } from './ponzi.service.js';
import { PortfolioService } from './portfolio.service.js';
import { SavingsInterestService } from './savings-interest.service.js';
import { TradingService } from './trading.service.js';

/**
 * Investments over time. Day end: savings and money-market accrual, deposit maturities, dividends on record dates,
 * ponzi collapses/payouts. Month end: savings and fund interest paid (10% WHT). Net worth: holdings at market value +
 * active deposits (cash, savings, pension and USD are already counted by the engine).
 *
 * Runs after lifestyle/allowance (living costs are paid before savings accrue) and before life events.
 */
@Injectable()
export class InvestmentsSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'investments';
  readonly order = 150;

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly savings: SavingsInterestService,
    private readonly deposits: DepositsService,
    private readonly trading: TradingService,
    private readonly ponzi: PonziService,
    private readonly portfolio: PortfolioService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    await this.savings.onDayEnd(ctx, dayIndex);
    await this.deposits.onDayEnd(ctx, dayIndex);
    await this.trading.payDividends(ctx, dayIndex);
    await this.ponzi.onDayEnd(ctx, dayIndex);
  }

  async onMonthEnd(ctx: SimulationContext, monthIndex: number): Promise<void> {
    await this.savings.onMonthEnd(ctx, monthIndex);
    await this.deposits.onMonthEnd(ctx, monthIndex);
  }

  netWorth(ctx: SimulationContext): Promise<number> {
    return this.portfolio.assetValue(ctx);
  }
}
