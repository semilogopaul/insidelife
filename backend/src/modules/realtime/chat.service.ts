import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { LessThan, type EntityManager, type Repository } from 'typeorm';
import {
  CHAT_REQUEST_MESSAGE_LIMIT,
  CHAT_RETENTION_DAYS,
  isHomeLocation,
  type ChatMediaKind,
  type ChatMessageDto,
  type ChatMessageKind,
  type DmRequestState,
  type DmStateDto,
  type DmThreadDto,
  type Paginated,
} from '@insidelife/shared';
import {
  ForbiddenActionException,
  GameRuleException,
  RateLimitedException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception.js';
import { REDIS } from '../../common/redis/redis.module.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import { SocialGuard } from '../social/social-guard.service.js';
import { sanitiseChat } from './chat-moderation.js';
import { ChatDmThreadEntity } from './entities/chat-dm-thread.entity.js';
import { ChatMessageEntity } from './entities/chat-message.entity.js';
import { MEDIA_DAILY_LIMIT, mediaPreview } from './media/chat-media.rules.js';
import { WealthClassService } from '../social/wealth-class.service.js';
import { ChatMediaService, type PreparedMedia, type UploadedChatFile } from './media/chat-media.service.js';

/** 6 messages per 10 seconds per character. */
const RATE_WINDOW_SECONDS = 10;
const RATE_LIMIT = 6;
/** How many conversations the DM list returns. */
const DM_THREAD_LIMIT = 50;
const PREVIEW_LENGTH = 120;
const DAY_MS = 86_400_000;

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
  readonly accepted: boolean;
  /** The other participant's `accepted` (null when they have no row yet). */
  readonly their_accepted: boolean | null;
  readonly friends: boolean;
}

/** Who may write what in a DM right now. */
interface DmGate {
  readonly counterpartId: string;
  /** Whether the recipient takes this sender's messages (false = it lands in their Requests). */
  readonly recipientAccepted: boolean;
}

export const dmChannel = (a: string, b: string): string => `dm:${[a, b].toSorted().join(':')}`;

/** Where a channel's messages live: Lagos chat (`global`) is kept per Lagos instance. */
export const instanceChannel = (channel: string, instance: string | null): string => (channel === 'global' && instance ? `global:${instance}` : channel);

/** The other participant of a DM channel (null if `characterId` isn't in it or it isn't a DM). */
export const dmCounterpart = (channel: string, characterId: string): string | null => {
  if (!channel.startsWith('dm:')) return null;
  const participants = channel.split(':').slice(1);
  if (participants.length !== 2 || !participants.includes(characterId)) return null;
  return participants.find((id) => id !== characterId) ?? null;
};

/**
 * Chat: Lagos-wide, venue and private (DM) channels. DMs follow message requests: friends and accepted conversations
 * are open; a non-friend's first messages land in the recipient's Requests (text only, a few messages) until they
 * accept, reply, delete or block. Blocks (either way) stop DMs entirely. Voice notes and photos are DM-only and need
 * an open conversation. Everything older than the retention window is deleted (see ChatRetentionService).
 */
@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatMessageEntity) private readonly messages: Repository<ChatMessageEntity>,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly directory: CharacterDirectory,
    private readonly social: SocialGuard,
    private readonly media: ChatMediaService,
    private readonly wealth: WealthClassService,
  ) {}

  /** Can this character read/write this channel right now? */
  canAccess(character: Pick<CharacterEntity, 'id' | 'locationId'>, channel: string): boolean {
    if (channel === 'global') return true;
    if (channel.startsWith('venue:')) {
      const locationId = channel.slice('venue:'.length);
      return locationId === character.locationId && !isHomeLocation(locationId);
    }
    if (channel.startsWith('dm:')) return dmCounterpart(channel, character.id) !== null;
    return false;
  }

/**
   * Send a text. `instance` scopes Lagos chat (`global`) to the sender's Lagos instance: it's stored as
   * `global:<instance>` and still presented as `global`.
   */
  async send(sender: CharacterEntity, channel: string, rawBody: string, instance: string | null = null): Promise<ChatMessageDto> {
    if (!this.canAccess(sender, channel))
      throw new GameRuleException('CHANNEL_FORBIDDEN', 'You’re not in that chat');
    const body = sanitiseChat(rawBody);
    if (!body) throw new GameRuleException('EMPTY_MESSAGE', 'Type something first');
    await this.throttle(sender.id);

    const saved = await this.messages.manager.transaction(async (manager) => {
      const gate = channel.startsWith('dm:') ? await this.dmGate(manager, sender, channel, 'text') : null;
      const message = await manager.save(
        manager.create(ChatMessageEntity, {
          ...this.senderColumns(sender),
          channel: instanceChannel(channel, instance),
          kind: 'text' as ChatMessageKind,
          body,
        }),
      );
      if (gate) await this.touchDmThreads(manager, channel, sender.id, message, body, gate);
      return message;
    });
    return this.toDtoWithWealth(saved);
  }

  /**
   * A server-written line in a venue's chat about something a player paid for ("🎤 DJ: shout out to @ada…"). Written
   * in the caller's transaction (so it exists only if the purchase commits); the caller pushes the returned message
   * to `message.channel` after commit. The text is the server's, built from already-cleaned player input.
   */
  async postVenueSystemLine(manager: EntityManager, sender: CharacterEntity, venueId: string, body: string): Promise<ChatMessageDto> {
    const saved = await manager.save(
      manager.create(ChatMessageEntity, {
        ...this.senderColumns(sender),
        channel: `venue:${venueId}`,
        kind: 'system' as ChatMessageKind,
        body: sanitiseChat(body),
      }),
    );
    return this.toDtoWithWealth(saved, manager);
  }

  /** A voice note or photo in a DM (uploaded over HTTP; the caller pushes the result to both participants). */
  async sendMedia(
    sender: CharacterEntity,
    channel: string,
    kind: ChatMediaKind,
    file: UploadedChatFile | undefined,
  ): Promise<ChatMessageDto> {
    if (!channel.startsWith('dm:') || !this.canAccess(sender, channel))
      throw new ForbiddenActionException('Voice notes and photos are for private chats');
    // Cheap checks first, so refused uploads never reach storage or the photo screen.
    await this.messages.manager.transaction((manager) => this.dmGate(manager, sender, channel, kind));
    await this.throttle(sender.id);
    await this.limitMedia(sender.id, kind);

    const prepared = await this.media.prepare(kind, file);
    try {
      const saved = await this.messages.manager.transaction(async (manager) => {
        const gate = await this.dmGate(manager, sender, channel, kind);
        const message = await manager.save(
          manager.create(ChatMessageEntity, {
            ...this.senderColumns(sender),
            channel,
            body: '',
            ...this.mediaColumns(prepared),
          }),
        );
        await this.touchDmThreads(
          manager,
          channel,
          sender.id,
          message,
          mediaPreview(kind, prepared.durationMs),
          gate,
        );
        return message;
      });
      return await this.toDtoWithWealth(saved);
    } catch (error) {
      await this.media.discard(prepared.key);
      throw error;
    }
  }

  /** What I can do in a DM right now (for the composer: request banner, media buttons, messages left). */
  async dmState(characterId: string, channel: string): Promise<DmStateDto> {
    const counterpartId = dmCounterpart(channel, characterId);
    if (!counterpartId) throw new ForbiddenActionException('You’re not in that chat');
    const manager = this.messages.manager;
    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const mine = await manager.findOne(ChatDmThreadEntity, { where: { characterId, channel } });
    const theirs = await manager.findOne(ChatDmThreadEntity, { where: { characterId: counterpartId, channel } });
    const friends = await this.social.areFriends(characterId, counterpartId, manager);
    const blocked = await this.social.isBlocked(characterId, counterpartId, manager);
    if (friends && !blocked)
      return { channel, request: 'none', canSendMedia: true, requestMessagesLeft: null };
    if (mine && !mine.accepted && !mine.declinedAt)
      return { channel, request: 'incoming', canSendMedia: false, requestMessagesLeft: null };
    if (theirs?.accepted && !blocked)
      return { channel, request: 'none', canSendMedia: true, requestMessagesLeft: null };
    const sent = blocked
      ? CHAT_REQUEST_MESSAGE_LIMIT
      : await manager.count(ChatMessageEntity, { where: { channel, senderId: characterId } });
    return {
      channel,
      request: 'outgoing',
      canSendMedia: false,
      requestMessagesLeft: Math.max(0, CHAT_REQUEST_MESSAGE_LIMIT - sent),
    };
  }

  /** Accept or delete a message request someone sent me. */
  async respondToRequest(characterId: string, channel: string, accept: boolean): Promise<DmStateDto> {
    if (!dmCounterpart(channel, characterId)) throw new ForbiddenActionException('You’re not in that chat');
    const result = await this.messages.manager.update(
      ChatDmThreadEntity,
      { characterId, channel },
      accept ? { accepted: true, declinedAt: null } : { accepted: false, declinedAt: new Date() },
    );
    if (!result.affected) throw new ResourceNotFoundException('Message request');
    return this.dmState(characterId, channel);
  }

  /** The player's conversations (and message requests), newest first, with unread state. */
  async dmThreads(characterId: string): Promise<DmThreadDto[]> {
    const rows = (await this.messages.manager.query(
      `SELECT t.channel, t.counterpart_id, c.handle, c.first_name, c.last_name,
              t.last_message_at, t.last_sender_id, t.last_preview, t.last_read_at, t.accepted,
              o.accepted AS their_accepted,
              EXISTS (SELECT 1 FROM social_friendships f
                       WHERE f.status = 'accepted'
                         AND f.pair_key = CASE WHEN t.character_id::text < t.counterpart_id::text
                                               THEN t.character_id::text || ':' || t.counterpart_id::text
                                               ELSE t.counterpart_id::text || ':' || t.character_id::text END) AS friends
         FROM chat_dm_threads t
         JOIN characters c ON c.id = t.counterpart_id
    LEFT JOIN chat_dm_threads o ON o.character_id = t.counterpart_id AND o.channel = t.channel
        WHERE t.character_id = $1
          AND t.declined_at IS NULL
          AND c.hidden_at IS NULL
          AND t.last_message_at > now() - make_interval(days => $2)
          AND NOT EXISTS (SELECT 1 FROM social_blocks b
                           WHERE (b.blocker_id = t.character_id AND b.blocked_id = t.counterpart_id)
                              OR (b.blocker_id = t.counterpart_id AND b.blocked_id = t.character_id))
     ORDER BY t.last_message_at DESC
        LIMIT ${DM_THREAD_LIMIT}`,
      [characterId, CHAT_RETENTION_DAYS],
    )) as DmThreadRow[];
    const classes = await this.wealth.classes(rows.map((row) => row.counterpart_id));
    return rows.map((row) => {
      const request: DmRequestState = row.friends
        ? 'none'
        : !row.accepted
          ? 'incoming'
          : row.their_accepted === false
            ? 'outgoing'
            : 'none';
      return {
        channel: row.channel,
        counterpart: {
          characterId: row.counterpart_id,
          handle: row.handle,
          firstName: row.first_name,
          lastName: row.last_name,
          wealthClass: classes.get(row.counterpart_id) ?? 'lapo',
        },
        lastMessageAt: row.last_message_at.toISOString(),
        preview: row.last_preview,
        lastFromMe: row.last_sender_id === characterId,
        unread:
          row.last_sender_id !== characterId &&
          (row.last_read_at === null || row.last_read_at < row.last_message_at),
        request,
      };
    });
  }

  /** Mark a conversation read for this character (no-op for channels they aren't in). */
  async markDmRead(characterId: string, channel: string): Promise<void> {
    await this.messages.manager.update(
      ChatDmThreadEntity,
      { characterId, channel },
      { lastReadAt: new Date() },
    );
  }

  /** A single message (moderation keeps a copy when a player is reported). */
  async findMessage(id: string): Promise<ChatMessageDto | null> {
    const row = await this.messages.findOne({ where: { id } });
    return row ? this.toDto(row) : null;
  }

  async history(channel: string, cursor: string | null, limit: number): Promise<Paginated<ChatMessageDto>> {
    const rows = await this.messages.find({
      where: cursor ? { channel, createdAt: LessThan(new Date(cursor)) } : { channel },
      order: { createdAt: 'DESC' },
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      items: (await this.withWealth(page.map((row) => this.toDto(row)))).toReversed(),
      nextCursor: rows.length > limit ? (page[page.length - 1]?.createdAt.toISOString() ?? null) : null,
    };
  }

  /** The stored object behind a signed media link (null when the link is bad or the message is gone). */
  async openMedia(messageId: string, expiresAt: number, signature: string) {
    if (!this.media.verifyLink(messageId, expiresAt, signature)) return null;
    const message = await this.messages.findOne({
      where: { id: messageId },
      select: { id: true, mediaKey: true, createdAt: true },
    });
    if (!message?.mediaKey || message.createdAt.getTime() < Date.now() - CHAT_RETENTION_DAYS * DAY_MS)
      return null;
    return this.media.open(message.mediaKey);
  }

  /**
   * Message-request rules for a DM write. Throws when the sender may not write (blocked, declined, request limit, or
   * media before acceptance); replying to an incoming request accepts it.
   */
  private async dmGate(
    manager: EntityManager,
    sender: CharacterEntity,
    channel: string,
    kind: ChatMessageKind,
  ): Promise<DmGate> {
    const counterpartId = dmCounterpart(channel, sender.id);
    if (!counterpartId) throw new ForbiddenActionException('You’re not in that chat');
    const counterpart = await this.directory.findById(counterpartId);
    if (!counterpart?.alive || counterpart.hiddenAt) throw new ForbiddenActionException('You can’t message this player');
    if (await this.social.isBlocked(sender.id, counterpartId, manager))
      throw new ForbiddenActionException('You can’t message this player');

    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const mine = await manager.findOne(ChatDmThreadEntity, { where: { characterId: sender.id, channel } });
    const theirs = await manager.findOne(ChatDmThreadEntity, { where: { characterId: counterpartId, channel } });
    if (await this.social.areFriends(sender.id, counterpartId, manager)) {
      if (theirs && !theirs.accepted)
        await manager.update(
          ChatDmThreadEntity,
          { characterId: counterpartId, channel },
          { accepted: true, declinedAt: null },
        );
      if (mine && !mine.accepted)
        await manager.update(
          ChatDmThreadEntity,
          { characterId: sender.id, channel },
          { accepted: true, declinedAt: null },
        );
      return { counterpartId, recipientAccepted: true };
    }
    // Replying to someone's request accepts it.
    if (mine && !mine.accepted) {
      await manager.update(
        ChatDmThreadEntity,
        { characterId: sender.id, channel },
        { accepted: true, declinedAt: null },
      );
      return { counterpartId, recipientAccepted: theirs?.accepted ?? true };
    }
    if (theirs?.accepted) return { counterpartId, recipientAccepted: true };
    if (theirs?.declinedAt)
      throw new ForbiddenActionException(`@${counterpart.handle} isn’t taking your messages`);
    if (kind !== 'text')
      throw new GameRuleException(
        'MEDIA_NEEDS_ACCEPT',
        'Voice notes and photos unlock once they accept your message request',
      );
    const sent = await manager.count(ChatMessageEntity, { where: { channel, senderId: sender.id } });
    if (sent >= CHAT_REQUEST_MESSAGE_LIMIT)
      throw new GameRuleException(
        'REQUEST_PENDING',
        `Wait for @${counterpart.handle} to accept your message request`,
      );
    return { counterpartId, recipientAccepted: false };
  }

  /** Upsert both participants' thread rows; the sender has read their own message. */
  private async touchDmThreads(
    manager: EntityManager,
    channel: string,
    senderId: string,
    message: ChatMessageEntity,
    previewText: string,
    gate: DmGate,
  ): Promise<void> {
    const preview = previewText.slice(0, PREVIEW_LENGTH);
    for (const characterId of [senderId, gate.counterpartId]) {
      const mine = characterId === senderId;
      await manager
        .createQueryBuilder()
        .insert()
        .into(ChatDmThreadEntity)
        .values({
          characterId,
          channel,
          counterpartId: mine ? gate.counterpartId : senderId,
          lastMessageAt: message.createdAt,
          lastSenderId: senderId,
          lastPreview: preview,
          lastReadAt: mine ? message.createdAt : null,
          accepted: mine || gate.recipientAccepted,
          declinedAt: null,
        })
        .orUpdate(
          mine
            ? ['last_message_at', 'last_sender_id', 'last_preview', 'last_read_at']
            : ['last_message_at', 'last_sender_id', 'last_preview'],
          ['character_id', 'channel'],
        )
        .execute();
    }
  }

  private async throttle(characterId: string): Promise<void> {
    const key = `chat:rate:${characterId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, RATE_WINDOW_SECONDS);
    if (count > RATE_LIMIT) throw new RateLimitedException('You’re typing too fast — breathe small');
  }

  private async limitMedia(characterId: string, kind: ChatMediaKind): Promise<void> {
    const key = `chat:media:${kind}:${characterId}:${new Date().toISOString().slice(0, 10)}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 2 * 86_400);
    if (count > MEDIA_DAILY_LIMIT)
      throw new RateLimitedException(
        kind === 'voice' ? 'That’s enough voice notes for today' : 'That’s enough photos for today',
      );
  }

  private senderColumns(sender: CharacterEntity) {
    return {
      senderId: sender.id,
      senderHandle: sender.handle,
      senderFirstName: sender.firstName,
      senderStatus: sender.status,
    };
  }

  private mediaColumns(prepared: PreparedMedia) {
    return {
      kind: prepared.kind as ChatMessageKind,
      mediaKey: prepared.key,
      mediaType: prepared.contentType,
      mediaBytes: prepared.bytes,
      durationMs: prepared.durationMs,
      width: prepared.width,
      height: prepared.height,
    };
  }

  private async toDtoWithWealth(entity: ChatMessageEntity, manager?: EntityManager): Promise<ChatMessageDto> {
    return (await this.withWealth([this.toDto(entity)], manager))[0]!;
  }

  /** Adds each sender's nepo/lapo class (one query for the batch). */
  private async withWealth(messages: ChatMessageDto[], manager?: EntityManager): Promise<ChatMessageDto[]> {
    const classes = await this.wealth.classes(messages.map((message) => message.sender.characterId), manager);
    return messages.map((message) => ({ ...message, sender: { ...message.sender, wealthClass: classes.get(message.sender.characterId) ?? 'lapo' } }));
  }

  private toDto(entity: ChatMessageEntity): ChatMessageDto {
    return {
      id: entity.id,
      // Lagos chat is stored per instance (`global:<instance>`) but is just `global` to clients.
      channel: entity.channel.startsWith('global:') ? 'global' : entity.channel,
      sender: {
        characterId: entity.senderId,
        handle: entity.senderHandle,
        firstName: entity.senderFirstName,
        status: entity.senderStatus,
      },
      kind: entity.kind,
      body: entity.body,
      media: this.media.toDto(entity),
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
