import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from '../events/events.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { DepositsService } from './deposits.service.js';
import { InvestmentDepositEntity } from './entities/deposit.entity.js';
import { InvestmentHoldingEntity } from './entities/holding.entity.js';
import { PonziStakeEntity } from './entities/ponzi-stake.entity.js';
import { SavingsAccrualEntity } from './entities/savings-accrual.entity.js';
import { InvestmentTradeEntity } from './entities/trade.entity.js';
import { FxAllowanceService } from './fx-allowance.service.js';
import { FxService } from './fx.service.js';
import { FxController, InvestmentsController, MarketsController, PortfolioController } from './investments.controller.js';
import { InvestmentEvents } from './investments.events.js';
import { InvestmentsSystem } from './investments.system.js';
import { MarketDataService } from './market-data.service.js';
import { PonziService } from './ponzi.service.js';
import { PortfolioService } from './portfolio.service.js';
import { SavingsInterestService } from './savings-interest.service.js';
import { TradingService } from './trading.service.js';

/** The Invest app: savings interest, deposits & T-bills, NGX stocks, crypto, the dollar desk and money life events. */
@Module({
  imports: [
    SimulationModule,
    EventsModule,
    TypeOrmModule.forFeature([InvestmentHoldingEntity, InvestmentTradeEntity, InvestmentDepositEntity, SavingsAccrualEntity, PonziStakeEntity]),
  ],
  controllers: [MarketsController, PortfolioController, InvestmentsController, FxController],
  providers: [
    MarketDataService,
    FxAllowanceService,
    TradingService,
    DepositsService,
    SavingsInterestService,
    PonziService,
    FxService,
    PortfolioService,
    InvestmentsSystem,
    InvestmentEvents,
  ],
})
export class InvestmentsModule {}
