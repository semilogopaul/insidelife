import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, type Repository } from 'typeorm';
import { CHAT_RETENTION_DAYS } from '@insidelife/shared';
import { ChatMessageEntity } from './entities/chat-message.entity.js';
import { ChatMediaService } from './media/chat-media.service.js';

const BATCH_SIZE = 1_000;
/** Per sweep; a backlog drains over the next hourly runs. */
const MAX_BATCHES = 50;
const DAY_MS = 86_400_000;

/**
 * Deletes chat (every channel) older than the retention window, with its voice notes and photos. DM thread rows stay
 * (they hold message-request state); the DM list hides threads with nothing recent.
 */
@Injectable()
export class ChatRetentionService {
  private readonly logger = new Logger(ChatRetentionService.name);

  constructor(
    @InjectRepository(ChatMessageEntity) private readonly messages: Repository<ChatMessageEntity>,
    private readonly media: ChatMediaService,
  ) {}

  async sweep(now = Date.now()): Promise<{ readonly messages: number; readonly media: number }> {
    const cutoff = new Date(now - CHAT_RETENTION_DAYS * DAY_MS);
    let messages = 0;
    let media = 0;
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const rows = await this.messages.find({
        where: { createdAt: LessThan(cutoff) },
        select: { id: true, mediaKey: true },
        order: { createdAt: 'ASC' },
        take: BATCH_SIZE,
      });
      if (rows.length === 0) break;
      const keys = rows.flatMap((row) => (row.mediaKey ? [row.mediaKey] : []));
      // Media first: a message without its file is harmless, an orphaned private file isn't.
      await this.media.discardMany(keys);
      await this.messages.delete(rows.map((row) => row.id));
      messages += rows.length;
      media += keys.length;
      if (rows.length < BATCH_SIZE) break;
    }
    if (messages > 0) this.logger.log({ messages, media }, 'Chat retention sweep');
    return { messages, media };
  }
}
