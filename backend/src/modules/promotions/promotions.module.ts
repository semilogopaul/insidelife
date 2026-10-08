import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { ModerationController } from './moderation.controller.js';
import { ModerationService } from './moderation.service.js';
import { PromotionsNotifier } from './promotions-notifier.service.js';
import { PromotionsWorldController } from './promotions-world.controller.js';
import { PromotionsController } from './promotions.controller.js';
import { StorageService } from './storage/storage.service.js';
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
  ],
  controllers: [PromotionsController, PromotionsWorldController, ModerationController],
  providers: [
    StorageService,
    CreativeService,
    CampaignsService,
    TracksService,
    ModerationService,
    TrackingService,
    ViewerResolver,
    PromotionsNotifier,
  ],
})
export class PromotionsModule {}
