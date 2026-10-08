import { Global, Module } from '@nestjs/common';
import { RealtimeBus } from './realtime-bus.service.js';

@Global()
@Module({
  providers: [RealtimeBus],
  exports: [RealtimeBus],
})
export class RealtimeBusModule {}
