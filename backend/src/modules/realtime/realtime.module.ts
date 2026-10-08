import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharactersModule } from '../characters/characters.module.js';
import { PresenceModule } from '../presence/presence.module.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ChatDmThreadEntity } from './entities/chat-dm-thread.entity.js';
import { ChatMessageEntity } from './entities/chat-message.entity.js';
import { RealtimeGateway } from './realtime.gateway.js';

@Module({
  imports: [CharactersModule, PresenceModule, TypeOrmModule.forFeature([ChatMessageEntity, ChatDmThreadEntity])],
  controllers: [ChatController],
  providers: [RealtimeGateway, ChatService],
  exports: [ChatService],
})
export class RealtimeModule {}
