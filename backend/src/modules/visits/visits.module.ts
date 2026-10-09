import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HOME_ACCESS_PORT } from '../../common/ports/home-access.port.js';
import { CharactersModule } from '../characters/characters.module.js';
import { FamilyModule } from '../family/family.module.js';
import { HousingModule } from '../housing/housing.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ShopModule } from '../shop/shop.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { SocialGuardModule } from '../social/social-guard.module.js';
import { HomeTreatEntity } from './entities/home-treat.entity.js';
import { HomeVisitEntity } from './entities/home-visit.entity.js';
import { HomeAccessAdapter } from './home-access.adapter.js';
import { HostingController } from './hosting.controller.js';
import { HostingService } from './hosting.service.js';
import { VisitsController } from './visits.controller.js';
import { VisitsService } from './visits.service.js';
import { VisitsSystem } from './visits.system.js';

/**
 * Home visits: invite a player over, they walk (or ride) in, you see each other inside, and the host can treat them.
 * Exposes HOME_ACCESS_PORT; consumes FAMILY_PORT (closeness between host and guest).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([HomeVisitEntity, HomeTreatEntity]),
    SimulationModule,
    CharactersModule,
    NotificationsModule,
    SocialGuardModule,
    HousingModule,
    ShopModule,
    FamilyModule,
  ],
  controllers: [VisitsController, HostingController],
  providers: [
    VisitsService,
    HostingService,
    VisitsSystem,
    HomeAccessAdapter,
    { provide: HOME_ACCESS_PORT, useExisting: HomeAccessAdapter },
  ],
  exports: [HOME_ACCESS_PORT],
})
export class VisitsModule {}
