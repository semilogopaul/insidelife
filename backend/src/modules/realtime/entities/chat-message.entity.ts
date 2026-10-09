import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { ChatMessageKind } from '@insidelife/shared';

@Entity('chat_messages')
@Index('chat_messages_channel_created', ['channel', 'createdAt'])
@Index('chat_messages_created', ['createdAt'])
export class ChatMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** `global`, `venue:<id>` or `dm:<a>:<b>`. */
  @Column({ type: 'varchar', length: 96 })
  channel: string;

  @Column({ type: 'uuid' })
  senderId: string;

  @Column({ type: 'varchar', length: 20 })
  senderHandle: string;

  @Column({ type: 'varchar', length: 40 })
  senderFirstName: string;

  @Column({ type: 'int', default: 0 })
  senderStatus: number;

  @Column({ type: 'varchar', length: 8, default: 'text' })
  kind: ChatMessageKind;

  /** Empty for voice notes and photos. */
  @Column({ type: 'varchar', length: 280 })
  body: string;

  /** Private-bucket object key (voice notes and photos); deleted with the message after the retention window. */
  @Column({ type: 'varchar', length: 96, nullable: true })
  mediaKey: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  mediaType: string | null;

  @Column({ type: 'int', nullable: true })
  mediaBytes: number | null;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ type: 'smallint', nullable: true })
  width: number | null;

  @Column({ type: 'smallint', nullable: true })
  height: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
