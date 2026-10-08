import { Global, Module } from '@nestjs/common';
import { CountersService } from '../services/counters.service.js';
import { PROGRESSION_SIGNALS_PORT } from '../../../common/ports/progression.port.js';
import { ProgressionSignalsService } from './progression-signals.service.js';

/**
 * Global and dependency-free on purpose: any domain can inject `PROGRESSION_SIGNALS_PORT` without importing the
 * progression module (which itself imports most domains), so no module cycles.
 */
@Global()
@Module({
  providers: [CountersService, ProgressionSignalsService, { provide: PROGRESSION_SIGNALS_PORT, useExisting: ProgressionSignalsService }],
  exports: [CountersService, PROGRESSION_SIGNALS_PORT],
})
export class ProgressionCountersModule {}
