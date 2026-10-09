import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ChatRetentionService } from './chat-retention.service.js';

export const CHAT_MAINTENANCE_QUEUE = 'chat-maintenance';

/** Hourly retention sweep (one repeatable job shared by every API instance). */
@Processor(CHAT_MAINTENANCE_QUEUE, { concurrency: 1 })
export class ChatRetentionProcessor extends WorkerHost {
  constructor(private readonly retention: ChatRetentionService) {
    super();
  }

  process(): Promise<{ readonly messages: number; readonly media: number }> {
    return this.retention.sweep();
  }
}

@Injectable()
export class ChatRetentionScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(CHAT_MAINTENANCE_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'chat-retention',
      { every: 3_600_000 },
      { name: 'sweep', opts: { removeOnComplete: 24, removeOnFail: 24 } },
    );
  }
}
