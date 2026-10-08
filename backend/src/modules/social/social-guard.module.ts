import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockEntity } from './entities/block.entity.js';
import { FriendshipEntity } from './entities/friendship.entity.js';
import { SocialGuard } from './social-guard.service.js';

/**
 * Lightweight module exposing `SocialGuard` (blocks/friendship checks) to other domains without pulling in the rest of
 * the social domain (and its port dependencies). `SocialModule` re-exports it too.
 */
@Module({
  imports: [TypeOrmModule.forFeature([BlockEntity, FriendshipEntity])],
  providers: [SocialGuard],
  exports: [SocialGuard],
})
export class SocialGuardModule {}
