import { Global, Module } from '@nestjs/common';
import { PresenceModule } from '../presence/presence.module.js';
import { WorldController } from './world.controller.js';
import { WorldService } from './world.service.js';

@Global()
@Module({
  imports: [PresenceModule],
  controllers: [WorldController],
  providers: [WorldService],
  exports: [WorldService],
})
export class WorldModule {}
