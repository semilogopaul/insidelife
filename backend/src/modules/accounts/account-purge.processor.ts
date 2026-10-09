import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AccountLifecycleService } from './account-lifecycle.service.js';

export const ACCOUNT_MAINTENANCE_QUEUE = 'account-maintenance';

/** Hourly: anonymise deleted accounts whose restore window has closed (one repeatable job for every API instance). */
@Processor(ACCOUNT_MAINTENANCE_QUEUE, { concurrency: 1 })
export class AccountPurgeProcessor extends WorkerHost {
  constructor(private readonly lifecycle: AccountLifecycleService) {
    super();
  }

  async process(): Promise<{ readonly purged: number }> {
    return { purged: await this.lifecycle.purgeDue() };
  }
}

@Injectable()
export class AccountPurgeScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(ACCOUNT_MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'account-purge',
      { every: 3_600_000 },
      { name: 'purge', opts: { removeOnComplete: 24, removeOnFail: 48 } },
    );
  }
}
