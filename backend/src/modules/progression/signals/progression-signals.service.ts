import { Injectable } from '@nestjs/common';
import { PROGRESSION_SIGNALS, progressionCounter, type ProgressionSignal } from '@insidelife/shared';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { CountersService } from '../services/counters.service.js';
import type { ProgressionSignalsPort } from '../../../common/ports/progression.port.js';

/**
 * Records cross-domain signals as counters. Deliberately does not evaluate goals here (that would make every caller
 * depend on every domain port); the next settle's day end or the player's next progression refresh picks them up.
 */
@Injectable()
export class ProgressionSignalsService implements ProgressionSignalsPort {
  constructor(private readonly counters: CountersService) {}

  async record(ctx: SimulationContext, signal: ProgressionSignal, amount = 0): Promise<void> {
    if (!PROGRESSION_SIGNALS.includes(signal)) return;
    const deltas = new Map<string, number>([[progressionCounter.signal(signal), 1]]);
    const total = Math.round(amount);
    if (Number.isFinite(total) && total > 0) deltas.set(progressionCounter.signalTotal(signal), total);
    await this.counters.increment(ctx, deltas);
  }
}
