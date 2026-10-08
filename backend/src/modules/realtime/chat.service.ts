import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { LessThan, type EntityManager, type Repository } from 'typeorm';
import { isHomeLocation, type ChatMessageDto, type DmThreadDto, type Paginated } from '@insidelife/shared';
import { GameRuleException, RateLimitedException } from '../../common/exceptions/domain.exception.js';
import { REDIS } from '../../common/redis/redis.module.js';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import { sanitiseChat } from './chat-moderation.js';
import { ChatDmThreadEntity } from './entities/chat-dm-thread.entity.js';
import { ChatMessageEntity } from './entities/chat-message.entity.js';

/** 6 messages per 10 seconds per character. */
const RATE_WINDOW_SECONDS = 10;
const RATE_LIMIT = 6;
/** How many conversations the DM list returns. */
const DM_THREAD_LIMIT = 50;
const PREVIEW_LENGTH = 120;

interface DmThreadRow {
  readonly channel: string;
  readonly counterpart_id: string;
  readonly handle: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly last_message_at: Date;
  readonly last_sender_id: string;
  readonly last_preview: string;
  readonly last_read_at: Date | null;
}

const toDto = (entity: ChatMessageEntity): ChatMessageDto => ({
  id: entity.id,
  channel: entity.channel,
  sender: { characterId: entity.senderId, handle: entity.senderHandle, firstName: entity.senderFirstName, status: entity.senderStatus },
  body: entity.body,
  createdAt: entity.createdAt.toISOString(),
});

export const dmChannel = (a: string, b: string): string => `dm:${[a, b].toSorted().join(':')}`;

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessageEntity) private readonly messages: Repository<ChatMessageEntity>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Can this character read/write this channel right now? */
  canAccess(character: Pick<CharacterEntity, 'id' | 'locationId'>, channel: string): boolean {
    if (channel === 'global') return true;
    if (channel.startsWith('venue:')) {
      const locationId = channel.slice('venue:'.length);
      return locationId === character.locationId && !isHomeLocation(locationId);
    }
    if (channel.startsWith('dm:')) return channel.split(':').slice(1).includes(character.id);
    return false;
  }

  async send(sender: CharacterEntity, channel: string, rawBody: string): Promise<ChatMessageDto> {
    if (!this.canAccess(sender, channel)) throw new GameRuleException('CHANNEL_FORBIDDEN', 'You’re not in that chat');
    const body = sanitiseChat(rawBody);
    if (!body) throw new GameRuleException('EMPTY_MESSAGE', 'Type something first');

    const key = `chat:rate:${sender.id}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, RATE_WINDOW_SECONDS);
    if (count > RATE_LIMIT) throw new RateLimitedException('You’re typing too fast — breathe small');

    const saved = await this.messages.manager.transaction(async (manager) => {
      const message = await manager.save(
        manager.create(ChatMessageEntity, {
          channel,
          senderId: sender.id,
          senderHandle: sender.handle,
          senderFirstName: sender.firstName,
          senderStatus: sender.status,
          body,
        }),
      );
      if (channel.startsWith('dm:')) await this.touchDmThreads(manager, channel, sender.id, message);
      return message;
    });
    return toDto(saved);
  }

  /** The player's conversations, newest first, with unread state. */
  async dmThreads(characterId: string): Promise<DmThreadDto[]> {
    const rows = (await this.messages.manager.query(
      `SELECT t.channel, t.counterpart_id, c.handle, c.first_name, c.last_name,
              t.last_message_at, t.last_sender_id, t.last_preview, t.last_read_at
         FROM chat_dm_threads t
         JOIN characters c ON c.id = t.counterpart_id
        WHERE t.character_id = $1
     ORDER BY t.last_message_at DESC
        LIMIT ${DM_THREAD_LIMIT}`,
      [characterId],
    )) as DmThreadRow[];
    return rows.map((row) => ({
      channel: row.channel,
      counterpart: { characterId: row.counterpart_id, handle: row.handle, firstName: row.first_name, lastName: row.last_name },
      lastMessageAt: row.last_message_at.toISOString(),
      preview: row.last_preview,
      lastFromMe: row.last_sender_id === characterId,
      unread: row.last_sender_id !== characterId && (row.last_read_at === null || row.last_read_at < row.last_message_at),
    }));
  }

  /** Mark a conversation read for this character (no-op for channels they aren't in). */
  async markDmRead(characterId: string, channel: string): Promise<void> {
    await this.messages.manager.update(ChatDmThreadEntity, { characterId, channel }, { lastReadAt: new Date() });
  }

  /** Upsert both participants' thread rows; the sender has read their own message. */
  private async touchDmThreads(manager: EntityManager, channel: string, senderId: string, message: ChatMessageEntity): Promise<void> {
    const participants = channel.split(':').slice(1);
    const preview = message.body.slice(0, PREVIEW_LENGTH);
    for (const characterId of participants) {
      const counterpartId = participants.find((id) => id !== characterId) ?? characterId;
      await manager
        .createQueryBuilder()
        .insert()
        .into(ChatDmThreadEntity)
        .values({
          characterId,
          channel,
          counterpartId,
          lastMessageAt: message.createdAt,
          lastSenderId: senderId,
          lastPreview: preview,
          lastReadAt: characterId === senderId ? message.createdAt : null,
        })
        .orUpdate(characterId === senderId ? ['last_message_at', 'last_sender_id', 'last_preview', 'last_read_at'] : ['last_message_at', 'last_sender_id', 'last_preview'], [
          'character_id',
          'channel',
        ])
        .execute();
    }
  }

  /** A single message (moderation keeps a copy when a player is reported). */
  async findMessage(id: string): Promise<ChatMessageDto | null> {
    const row = await this.messages.findOne({ where: { id } });
    return row ? toDto(row) : null;
  }

  async history(channel: string, cursor: string | null, limit: number): Promise<Paginated<ChatMessageDto>> {
    const rows = await this.messages.find({
      where: cursor ? { channel, createdAt: LessThan(new Date(cursor)) } : { channel },
      order: { createdAt: 'DESC' },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map(toDto).toReversed(),
      nextCursor: rows.length > limit ? (page[page.length - 1]?.createdAt.toISOString() ?? null) : null,
    };
  }
}
