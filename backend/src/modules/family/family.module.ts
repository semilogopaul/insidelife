import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FAMILY_PORT } from '../../common/ports/family.port.js';
import { CareersModule } from '../careers/careers.module.js';
import { CharactersModule } from '../characters/characters.module.js';
import { EventsModule } from '../events/events.module.js';
import { HousingModule } from '../housing/housing.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { SocialGuardModule } from '../social/social-guard.module.js';
import { FamilyTriggerEntity } from './entities/family-trigger.entity.js';
import { MarriageEntity } from './entities/marriage.entity.js';
import { PersonEntity } from './entities/person.entity.js';
import { ProposalEntity } from './entities/proposal.entity.js';
import { RelationshipEntity } from './entities/relationship.entity.js';
import { SuccessionEntity } from './entities/succession.entity.js';
import { FamilyController } from './family.controller.js';
import { FamilyService } from './family.service.js';
import { FamilySystem } from './family.system.js';
import { ProposalsController } from './proposals.controller.js';
import { RelationshipsController } from './relationships.controller.js';
import { BlackTaxService } from './services/black-tax.service.js';
import { ChildrenService } from './services/children.service.js';
import { FamilyTriggersService } from './services/family-triggers.service.js';
import { HealthBridge } from './services/health-bridge.service.js';
import { HouseholdService } from './services/household.service.js';
import { InteractionsService } from './services/interactions.service.js';
import { MarriagesService } from './services/marriages.service.js';
import { PeopleService } from './services/people.service.js';
import { PlayerLinksService } from './services/player-links.service.js';
import { PlayerNotifier } from './services/player-notifier.service.js';
import { RelationshipsService } from './services/relationships.service.js';
import { RomanceService } from './services/romance.service.js';
import { SuccessionService } from './services/succession.service.js';
import { SuccessionSystem } from './succession.system.js';

/**
 * Family & relationships: NPC family, people met around Lagos, romance and marriage (with NPCs and players),
 * children and school fees, black tax, and succession when a character dies.
 *
 * Implements FAMILY_PORT. Consumes EMPLOYMENT_PORT (CareersModule), HOUSEHOLD_PORT (HousingModule: estate transfer) and `SocialGuard` (blocks, friendships — the social
 * domain owns the friend list). HEALTH_PORT (pregnancy) is resolved lazily by `HealthBridge` so health and family never
 * import each other.
 */
@Module({
  imports: [
    SimulationModule,
    EventsModule,
    CareersModule,
    HousingModule,
    CharactersModule,
    NotificationsModule,
    SocialGuardModule,
    TypeOrmModule.forFeature([PersonEntity, RelationshipEntity, MarriageEntity, ProposalEntity, FamilyTriggerEntity, SuccessionEntity]),
  ],
  controllers: [FamilyController, RelationshipsController, ProposalsController],
  providers: [
    RelationshipsService,
    MarriagesService,
    HouseholdService,
    FamilyTriggersService,
    PlayerNotifier,
    HealthBridge,
    PeopleService,
    ChildrenService,
    RomanceService,
    PlayerLinksService,
    InteractionsService,
    BlackTaxService,
    SuccessionService,
    FamilyService,
    FamilySystem,
    SuccessionSystem,
    { provide: FAMILY_PORT, useExisting: FamilyService },
  ],
  exports: [FamilyService, FAMILY_PORT],
})
export class FamilyModule {}
