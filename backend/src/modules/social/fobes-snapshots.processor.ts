import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { FobesSnapshotsService } from './fobes-snapshots.service.js';

export const FOBES_QUEUE = 'fobes';

/** The world tick for Fobes: every real minute, take today's top-100 snapshot if it's missing (a game day is ~24). */
@Processor(FOBES_QUEUE, { concurrency: 1 })
export class FobesSnapshotProcessor extends WorkerHost {
  constructor(private readonly snapshots: FobesSnapshotsService) {
    super();
  }

  process(): Promise<{ readonly day: number; readonly taken: number }> {
    return this.snapshots.takeDaily();
  }
}

/** Registers the repeatable job once (idempotent across instances thanks to the scheduler id). */
@Injectable()
export class FobesSnapshotScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(FOBES_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler('fobes-daily-snapshot', { every: 60_000 }, { name: 'snapshot', opts: { removeOnComplete: 10, removeOnFail: 20 } });
  }
}
