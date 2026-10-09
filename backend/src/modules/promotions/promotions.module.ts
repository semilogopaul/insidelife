import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '../../common/storage/storage.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CharactersModule } from '../characters/characters.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { CampaignsService } from './campaigns.service.js';
import { CreativeService } from './creative.service.js';
import { AdCampaignEntity } from './entities/ad-campaign.entity.js';
import { ClubPlayOrderEntity } from './entities/club-play-order.entity.js';
import { ClubTrackEntity } from './entities/club-track.entity.js';
import { CreativeEntity } from './entities/creative.entity.js';
import { ModerationLogEntity } from './entities/moderation-log.entity.js';
import { ModerationService } from './moderation.service.js';
import { PromotionsNotifier } from './promotions-notifier.service.js';
import { PromotionsWorldController } from './promotions-world.controller.js';
import { PromotionsController } from './promotions.controller.js';
import { TracksService } from './tracks.service.js';
import { TrackingService } from './tracking/tracking.service.js';
import { ViewerResolver } from './tracking/viewer-resolver.service.js';

/**
 * Real-money promotions: Billboards (ads on in-world billboards) and Club DJ (paid club rotation). Payments go through
 * the payments module's CHECKOUT_PORT; this module registers the 'billboard' and 'club-play' fulfillers on init.
 * AuthModule is imported only for optional viewer auth on the public tracking endpoints.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AdCampaignEntity, CreativeEntity, ClubTrackEntity, ClubPlayOrderEntity, ModerationLogEntity]),
    PaymentsModule,
    CharactersModule,
    NotificationsModule,
    AuthModule,
    StorageModule,
  ],
  controllers: [PromotionsController, PromotionsWorldController],
  providers: [
    CreativeService,
    CampaignsService,
    TracksService,
    ModerationService,
    TrackingService,
    ViewerResolver,
    PromotionsNotifier,
  ],
  // The admin API (modules/admin) reviews paid ads and club orders through ModerationService.
  exports: [ModerationService],
})
export class PromotionsModule {}
