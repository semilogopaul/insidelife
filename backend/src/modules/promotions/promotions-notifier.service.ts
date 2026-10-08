import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { withTransaction } from '../../database/transaction.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import { NotificationsService, type NotificationDraft } from '../notifications/notifications.service.js';
import { WorldService } from '../world/world.service.js';

export type PromotionNotice = Pick<NotificationDraft, 'title' | 'body' | 'tone'>;

/**
 * Tells a buyer what happened to their ad or track: an in-game notification on their living character (own short
 * transaction) pushed to their sockets. Buyers without a character (brands) simply get none. Never throws — a missed
 * notification must not undo a payment or a moderation decision.
 */
@Injectable()
export class PromotionsNotifier {
  private readonly logger = new Logger(PromotionsNotifier.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly directory: CharacterDirectory,
    private readonly notifications: NotificationsService,
    private readonly world: WorldService,
  ) {}

  async notifyOwner(ownerUserId: string, notice: PromotionNotice): Promise<void> {
    try {
      const character = await this.directory.findLivingByUser(ownerUserId);
      if (!character) return;
      const draft: NotificationDraft = { kind: 'system', title: notice.title, body: notice.body, tone: notice.tone, gameMinute: this.world.now() };
      const created = await withTransaction(this.dataSource, (manager) => this.notifications.create(manager, character.id, [draft]));
      this.notifications.push(character.id, created);
    } catch (error) {
      this.logger.warn({ err: error, ownerUserId }, 'Promotion notification failed');
    }
  }
}
