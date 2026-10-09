import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HOUSEHOLD_PORT } from '../../common/ports/household.port.js';
import { EventsModule } from '../events/events.module.js';
import { ShopModule } from '../shop/shop.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { ComfortService } from './comfort.service.js';
import { ConstructionService } from './construction.service.js';
import { BuildingEntity } from './entities/building.entity.js';
import { LeaseEntity } from './entities/lease.entity.js';
import { PropertySaleEntity } from './entities/property-sale.entity.js';
import { PropertyEntity } from './entities/property.entity.js';
import { ResidenceEntity } from './entities/residence.entity.js';
import { HomeService } from './home.service.js';
import { HousePurchasesService } from './house-purchases.service.js';
import { MakeoverService } from './makeover.service.js';
import { HousingEventsRegistrar } from './housing-events.registrar.js';
import { HousingController } from './housing.controller.js';
import { HousingService } from './housing.service.js';
import { HousingStore } from './housing.store.js';
import { HousingSystem } from './housing.system.js';
import { LandService } from './land.service.js';
import { LettingsService } from './lettings.service.js';
import { MovesService } from './moves.service.js';
import { PowerService } from './power.service.js';
import { PropertySalesService } from './property-sales.service.js';
import { RentalsService } from './rentals.service.js';
import { UpkeepService } from './upkeep.service.js';

/**
 * Housing & property: the family house, rentals, land and titles, construction, letting, selling, NEPA and the
 * life-event cards that come with Lagos real estate. Implements `HOUSEHOLD_PORT`; consumes `INVENTORY_PORT`.
 */
@Module({
  imports: [
    SimulationModule,
    EventsModule,
    ShopModule,
    TypeOrmModule.forFeature([ResidenceEntity, LeaseEntity, PropertyEntity, BuildingEntity, PropertySaleEntity]),
  ],
  controllers: [HousingController],
  providers: [
    HousingStore,
    HomeService,
    PowerService,
    ComfortService,
    RentalsService,
    LettingsService,
    MovesService,
    LandService,
    ConstructionService,
    UpkeepService,
    PropertySalesService,
    HousePurchasesService,
    MakeoverService,
    HousingService,
    HousingSystem,
    HousingEventsRegistrar,
    { provide: HOUSEHOLD_PORT, useExisting: HousingService },
  ],
  exports: [HousingService, HOUSEHOLD_PORT],
})
export class HousingModule {}
