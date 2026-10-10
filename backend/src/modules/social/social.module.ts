import { BullModule } from '@nestjs/bullmq';
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
import { RealtimeModule } from '../realtime/realtime.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { PeerMoneyModule } from '../wallet/peer-money.module.js';
import { BlockEntity } from './entities/block.entity.js';
import { FobesSnapshotEntity } from './entities/fobes-snapshot.entity.js';
import { FriendshipEntity } from './entities/friendship.entity.js';
import { NightMomentEntity } from './entities/night-moment.entity.js';
import { PartyGuestEntity } from './entities/party-guest.entity.js';
import { PartyEntity } from './entities/party.entity.js';
import { ReportEntity } from './entities/report.entity.js';
import { SocialProfileEntity } from './entities/social-profile.entity.js';
import { SprayEntity } from './entities/spray.entity.js';
import { VenueSprayEntity } from './entities/venue-spray.entity.js';
import { FobesController } from './fobes.controller.js';
import { FOBES_QUEUE, FobesSnapshotProcessor, FobesSnapshotScheduler } from './fobes-snapshots.processor.js';
import { FobesSnapshotsService } from './fobes-snapshots.service.js';
import { FobesService } from './fobes.service.js';
import { FriendsController } from './friends.controller.js';
import { FriendsService } from './friends.service.js';
import { LeaderboardsController } from './leaderboards.controller.js';
import { LeaderboardsService } from './leaderboards.service.js';
import { BlocksController, ReportsController } from './moderation.controller.js';
import { ModerationService } from './moderation.service.js';
import { NightOutController } from './night-out.controller.js';
import { NightOutService } from './night-out.service.js';
import { PartiesController } from './parties.controller.js';
import { PartiesService } from './parties.service.js';
import { PlayerCardsService } from './player-cards.service.js';
import { PlayersController, VenuePlayersController } from './players.controller.js';
import { ProfilesService } from './profiles.service.js';
import { RankingCache } from './ranking-cache.service.js';
import { ReportReviewService } from './report-review.service.js';
import { SOCIAL_LIFE_EVENTS } from './social.events.js';
import { SocialGuardModule } from './social-guard.module.js';
import { WealthClassModule } from './wealth-class.module.js';
import { SocialNotifier } from './social-notifier.service.js';
import { SocialSystem } from './social.system.js';
import { SocialViewer } from './social-viewer.service.js';
import { VenueSpraysController } from './venue-sprays.controller.js';
import { VenueSpraysService } from './venue-sprays.service.js';

/**
 * Social domain: friends, blocks & reports, public profiles and search, "who's here", leaderboards, Fobes (the Lagos
 * Rich List, with its daily snapshot job) and owambe parties
 * with spraying, spraying in clubs and bars, and club nights (bottles for people, DJ shoutouts, paid experiences).
 * Other domains should import `SocialGuardModule` (re-exported here) for `SocialGuard`; the admin API uses
 * `ReportReviewService` to close reports.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FriendshipEntity,
      BlockEntity,
      ReportEntity,
      SocialProfileEntity,
      PartyEntity,
      PartyGuestEntity,
      SprayEntity,
      VenueSprayEntity,
      NightMomentEntity,
      FobesSnapshotEntity,
    ]),
    // Fobes' daily top-100 snapshot (a world tick).
    BullModule.registerQueue({ name: FOBES_QUEUE }),
    SimulationModule,
    CharactersModule,
    NotificationsModule,
    PresenceModule,
    // Venue chat system lines (ChatService).
    RealtimeModule,
    EventsModule,
    CareersModule,
    EducationModule,
    FamilyModule,
    SocialGuardModule,
    WealthClassModule,
    PeerMoneyModule,
  ],
  controllers: [
    FriendsController,
    BlocksController,
    ReportsController,
    PlayersController,
    VenuePlayersController,
    LeaderboardsController,
    FobesController,
    PartiesController,
    VenueSpraysController,
    NightOutController,
  ],
  providers: [
    PlayerCardsService,
    SocialNotifier,
    SocialViewer,
    FriendsService,
    ModerationService,
    ProfilesService,
    RankingCache,
    LeaderboardsService,
    FobesSnapshotsService,
    FobesService,
    FobesSnapshotProcessor,
    FobesSnapshotScheduler,
    PartiesService,
    VenueSpraysService,
    NightOutService,
    SocialSystem,
    ReportReviewService,
  ],
  exports: [SocialGuardModule, ReportReviewService],
})
export class SocialModule implements OnModuleInit {
  constructor(private readonly lifeEvents: LifeEventsRegistry) {}

  onModuleInit(): void {
    this.lifeEvents.register(...SOCIAL_LIFE_EVENTS);
  }
}
