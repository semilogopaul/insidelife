import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { SETTLEMENT_QUEUE } from './settlement.constants.js';

/** Registers the repeatable sweep once (idempotent across instances thanks to the scheduler id). */
@Injectable()
export class SettlementScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(SETTLEMENT_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler('settle-stale-characters', { every: 60_000 }, { name: 'sweep', opts: { removeOnComplete: 50, removeOnFail: 50 } });
  }
}
