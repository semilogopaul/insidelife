import { Global, Module } from '@nestjs/common';
import { OverloadMonitor } from './overload-monitor.service.js';

/** Event-loop overload detection, shared by the HTTP load shedder (`app.setup.ts`) and the realtime gateway. */
@Global()
@Module({
  providers: [OverloadMonitor],
  exports: [OverloadMonitor],
})
export class OverloadModule {}
