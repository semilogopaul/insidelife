import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HOME_ACCESS_PORT } from '../../common/ports/home-access.port.js';
import { CharactersModule } from '../characters/characters.module.js';
import { HousingModule } from '../housing/housing.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ShopModule } from '../shop/shop.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { SocialGuardModule } from '../social/social-guard.module.js';
import { HomeVisitEntity } from './entities/home-visit.entity.js';
import { HomeAccessAdapter } from './home-access.adapter.js';
import { VisitsController } from './visits.controller.js';
import { VisitsService } from './visits.service.js';
import { VisitsSystem } from './visits.system.js';

/** Home visits: invite a player over, they walk (or ride) in, you see each other inside. Exposes HOME_ACCESS_PORT. */
@Module({
  imports: [
    TypeOrmModule.forFeature([HomeVisitEntity]),
    SimulationModule,
    CharactersModule,
    NotificationsModule,
    SocialGuardModule,
    HousingModule,
    ShopModule,
  ],
  controllers: [VisitsController],
  providers: [
    VisitsService,
    VisitsSystem,
    HomeAccessAdapter,
    { provide: HOME_ACCESS_PORT, useExisting: HomeAccessAdapter },
  ],
  exports: [HOME_ACCESS_PORT],
})
export class VisitsModule {}
