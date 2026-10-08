import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('chat_messages')
@Index('chat_messages_channel_created', ['channel', 'createdAt'])
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

  @Column({ type: 'varchar', length: 280 })
  body: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
