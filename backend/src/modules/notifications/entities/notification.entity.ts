import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { NotificationKind } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

@Entity('notifications')
@Index('notifications_character_created', ['characterId', 'createdAt'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 24 })
  kind: NotificationKind;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 500 })
  body: string;

  @Column({ type: 'varchar', length: 8, default: 'neutral' })
  tone: 'good' | 'bad' | 'neutral';

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  amount: number | null;

  @Column({ type: 'bigint', transformer: bigintNumber })
  gameMinute: number;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
