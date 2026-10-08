import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * A participant's view of one DM conversation (two rows per channel, one per participant), updated on every send.
 * Lets the DM list load newest-first with unread state in one indexed query, instead of scanning `chat_messages`.
 */
@Entity('chat_dm_threads')
@Index('chat_dm_threads_character_recent', ['characterId', 'lastMessageAt'])
export class ChatDmThreadEntity {
  @PrimaryColumn({ type: 'uuid' })
  characterId: string;

  @PrimaryColumn({ type: 'varchar', length: 96 })
  channel: string;

  @Column({ type: 'uuid' })
  counterpartId: string;

  @Column({ type: 'timestamptz' })
  lastMessageAt: Date;

  @Column({ type: 'uuid' })
  lastSenderId: string;

  @Column({ type: 'varchar', length: 120 })
  lastPreview: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastReadAt: Date | null;
}
