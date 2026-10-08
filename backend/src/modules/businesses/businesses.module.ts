import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CareersModule } from '../careers/careers.module.js';
import { EventsModule } from '../events/events.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { BusinessAppraiser } from './business-appraiser.service.js';
import { BusinessEventsRegistrar } from './business-events.registrar.js';
import { BusinessIncomeSource } from './business-income.source.js';
import { BusinessPnlService } from './business-pnl.service.js';
import { BusinessesController } from './businesses.controller.js';
import { BusinessesService } from './businesses.service.js';
import { BusinessesStore } from './businesses.store.js';
import { BusinessesSystem } from './businesses.system.js';
import { BusinessPnlEntity } from './entities/business-pnl.entity.js';
import { BusinessEntity } from './entities/business.entity.js';

/**
 * Businesses: start-ups from a POS kiosk to a filling station, monthly P&L, expansions, sales and closures, plus
 * business life events. Registers its profits with careers' `IncomeSourcesRegistry` (businesses → careers).
 */
@Module({
  imports: [SimulationModule, EventsModule, CareersModule, TypeOrmModule.forFeature([BusinessEntity, BusinessPnlEntity])],
  controllers: [BusinessesController],
  providers: [
    BusinessesStore,
    BusinessAppraiser,
    BusinessPnlService,
    BusinessesService,
    BusinessesSystem,
    BusinessIncomeSource,
    BusinessEventsRegistrar,
  ],
})
export class BusinessesModule {}
