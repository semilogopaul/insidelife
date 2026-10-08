import { Module, type OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CareersModule } from '../careers/careers.module.js';
import { CharactersModule } from '../characters/characters.module.js';
import { EducationModule } from '../education/education.module.js';
import { EventsModule } from '../events/events.module.js';
import { LifeEventsRegistry } from '../events/life-events.registry.js';
import { FamilyModule } from '../family/family.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { BlockEntity } from './entities/block.entity.js';
import { FriendshipEntity } from './entities/friendship.entity.js';
import { PartyGuestEntity } from './entities/party-guest.entity.js';
import { PartyEntity } from './entities/party.entity.js';
import { ReportEntity } from './entities/report.entity.js';
import { SocialProfileEntity } from './entities/social-profile.entity.js';
import { SprayEntity } from './entities/spray.entity.js';
import { FriendsController } from './friends.controller.js';
import { FriendsService } from './friends.service.js';
import { LeaderboardsController } from './leaderboards.controller.js';
import { LeaderboardsService } from './leaderboards.service.js';
import { BlocksController, ReportsController } from './moderation.controller.js';
import { ModerationService } from './moderation.service.js';
import { PartiesController } from './parties.controller.js';
import { PartiesService } from './parties.service.js';
import { PlayerCardsService } from './player-cards.service.js';
import { PlayersController, VenuePlayersController } from './players.controller.js';
import { ProfilesService } from './profiles.service.js';
import { SOCIAL_LIFE_EVENTS } from './social.events.js';
import { SocialGuardModule } from './social-guard.module.js';
import { SocialNotifier } from './social-notifier.service.js';
import { SocialSystem } from './social.system.js';
import { SocialViewer } from './social-viewer.service.js';

/**
 * Social domain: friends, blocks & reports, public profiles and search, "who's here", leaderboards and owambe parties
 * with spraying. Other domains should import `SocialGuardModule` (re-exported here) for `SocialGuard`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([FriendshipEntity, BlockEntity, ReportEntity, SocialProfileEntity, PartyEntity, PartyGuestEntity, SprayEntity]),
    SimulationModule,
    CharactersModule,
    NotificationsModule,
    PresenceModule,
    EventsModule,
    CareersModule,
    EducationModule,
    FamilyModule,
    SocialGuardModule,
  ],
  controllers: [
    FriendsController,
    BlocksController,
    ReportsController,
    PlayersController,
    VenuePlayersController,
    LeaderboardsController,
    PartiesController,
  ],
  providers: [
    PlayerCardsService,
    SocialNotifier,
    SocialViewer,
    FriendsService,
    ModerationService,
    ProfilesService,
    LeaderboardsService,
    PartiesService,
    SocialSystem,
  ],
  exports: [SocialGuardModule],
})
export class SocialModule implements OnModuleInit {
  constructor(private readonly lifeEvents: LifeEventsRegistry) {}

  onModuleInit(): void {
    this.lifeEvents.register(...SOCIAL_LIFE_EVENTS);
  }
}
