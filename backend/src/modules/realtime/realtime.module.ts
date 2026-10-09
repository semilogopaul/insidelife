import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageSafetyModule } from '../../common/moderation/image-safety.module.js';
import { StorageModule } from '../../common/storage/storage.module.js';
import { CharactersModule } from '../characters/characters.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { SocialGuardModule } from '../social/social-guard.module.js';
import {
  ChatRetentionProcessor,
  ChatRetentionScheduler,
  CHAT_MAINTENANCE_QUEUE,
} from './chat-retention.processor.js';
import { ChatRetentionService } from './chat-retention.service.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ChatDmThreadEntity } from './entities/chat-dm-thread.entity.js';
import { ChatMessageEntity } from './entities/chat-message.entity.js';
import { ChatMediaService } from './media/chat-media.service.js';
import { RealtimeGateway } from './realtime.gateway.js';

@Module({
  imports: [
    CharactersModule,
    PresenceModule,
    SocialGuardModule,
    StorageModule,
    ImageSafetyModule,
    TypeOrmModule.forFeature([ChatMessageEntity, ChatDmThreadEntity]),
    BullModule.registerQueue({ name: CHAT_MAINTENANCE_QUEUE }),
  ],
  controllers: [ChatController],
  providers: [
    RealtimeGateway,
    ChatService,
    ChatMediaService,
    ChatRetentionService,
    ChatRetentionProcessor,
    ChatRetentionScheduler,
  ],
  exports: [ChatService],
})
export class RealtimeModule {}
