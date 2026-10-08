import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { IsNull, LessThan, type DataSource, type EntityManager } from 'typeorm';
import type { NotificationDto, NotificationKind, Paginated } from '@insidelife/shared';
import { RealtimeBus } from '../realtime-bus/realtime-bus.service.js';
import { NotificationEntity } from './entities/notification.entity.js';

export interface NotificationDraft {
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string;
  readonly tone?: 'good' | 'bad' | 'neutral';
  readonly amount?: number;
  readonly gameMinute: number;
}

const toDto = (entity: NotificationEntity): NotificationDto => ({
  id: entity.id,
  kind: entity.kind,
  title: entity.title,
  body: entity.body,
  tone: entity.tone,
  amount: entity.amount ?? undefined,
  gameMinute: entity.gameMinute,
  createdAt: entity.createdAt.toISOString(),
  read: entity.readAt !== null,
});

@Injectable()
export class NotificationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bus: RealtimeBus,
  ) {}

  /** Persist inside the caller's transaction; returns DTOs to push after commit via `push`. */
  async create(manager: EntityManager, characterId: string, drafts: readonly NotificationDraft[]): Promise<NotificationDto[]> {
    if (drafts.length === 0) return [];
    const entities = drafts.map((draft) =>
      manager.create(NotificationEntity, {
        characterId,
        kind: draft.kind,
        title: draft.title.slice(0, 120),
        body: draft.body.slice(0, 500),
        tone: draft.tone ?? 'neutral',
        amount: draft.amount ?? null,
        gameMinute: draft.gameMinute,
        readAt: null,
      }),
    );
    const saved = await manager.save(entities);
    return saved.map(toDto);
  }

  /** Push already-committed notifications to the character's live sockets. */
  push(characterId: string, notifications: readonly NotificationDto[]): void {
    for (const notification of notifications.slice(-10)) this.bus.toCharacter(characterId, 'notification', notification);
  }

  async list(characterId: string, cursor: string | null, limit: number): Promise<Paginated<NotificationDto>> {
    const repo = this.dataSource.getRepository(NotificationEntity);
    const rows = await repo.find({
      where: cursor ? { characterId, createdAt: LessThan(new Date(cursor)) } : { characterId },
      order: { createdAt: 'DESC' },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map(toDto),
      nextCursor: rows.length > limit ? (page[page.length - 1]?.createdAt.toISOString() ?? null) : null,
    };
  }

  unreadCount(manager: EntityManager, characterId: string): Promise<number> {
    return manager.count(NotificationEntity, { where: { characterId, readAt: IsNull() } });
  }

  async markAllRead(characterId: string): Promise<void> {
    await this.dataSource.getRepository(NotificationEntity).update({ characterId, readAt: IsNull() }, { readAt: new Date() });
  }
}
