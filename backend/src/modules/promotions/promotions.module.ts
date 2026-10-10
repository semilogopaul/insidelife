import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '../../common/storage/storage.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CharactersModule } from '../characters/characters.module.js';
import { LifeModule } from '../life/life.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { AdRatesService } from './ad-rates.service.js';
import { CampaignsService } from './campaigns.service.js';
import { ClubPlayRecorder } from './club-play-recorder.service.js';
import { ClubScheduleService } from './club-schedule.service.js';
import { CreativeService } from './creative.service.js';
import { AdCampaignEntity } from './entities/ad-campaign.entity.js';
import { AdRateEntity } from './entities/ad-rate.entity.js';
import { ClubPlayEntity } from './entities/club-play.entity.js';
import { ClubPlayOrderEntity } from './entities/club-play-order.entity.js';
import { ClubTrackEntity } from './entities/club-track.entity.js';
import { CreativeEntity } from './entities/creative.entity.js';
import { ModerationLogEntity } from './entities/moderation-log.entity.js';
import { PromotionAudienceEntity } from './entities/promotion-audience.entity.js';
import { ModerationService } from './moderation.service.js';
import { PromotionLifecycle } from './promotion-lifecycle.service.js';
import { PromotionsNotifier } from './promotions-notifier.service.js';
import { PromotionsWorldController } from './promotions-world.controller.js';
import { PromotionsController } from './promotions.controller.js';
import { TracksService } from './tracks.service.js';
import { TrackingService } from './tracking/tracking.service.js';
import { ViewerResolver } from './tracking/viewer-resolver.service.js';

/**
 * Real-money promotions: ads (billboards, street spots, Lagos TV, phone apps) and Club DJ (paid songs on the club
 * schedule). Payments go through the payments module's CHECKOUT_PORT; this module registers the 'billboard' and
 * 'club-play' fulfillers on init. LifeModule provides the player's last position (views are checked against it),
 * PresenceModule who is in a club (audiences). AuthModule is imported only for optional viewer auth on the public
 * tracking endpoints. `AdRatesService` (the editable price list) is exported for the admin routes.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AdCampaignEntity, CreativeEntity, ClubTrackEntity, ClubPlayOrderEntity, ClubPlayEntity, PromotionAudienceEntity, ModerationLogEntity, AdRateEntity]),
    PaymentsModule,
    CharactersModule,
    NotificationsModule,
    PresenceModule,
    LifeModule,
    AuthModule,
    StorageModule,
  ],
  controllers: [PromotionsController, PromotionsWorldController],
  providers: [
    AdRatesService,
    CreativeService,
    CampaignsService,
    ClubScheduleService,
    TracksService,
    ModerationService,
    TrackingService,
    ClubPlayRecorder,
    PromotionLifecycle,
    ViewerResolver,
    PromotionsNotifier,
  ],
  // The admin API (modules/admin) reviews paid ads and club orders through ModerationService and edits ad prices
  // through AdRatesService.
  exports: [ModerationService, AdRatesService],
})
export class PromotionsModule {}
