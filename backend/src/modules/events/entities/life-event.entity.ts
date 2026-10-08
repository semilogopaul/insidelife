import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';
import type { LifeEventOutcome, LifeEventParams } from '../interfaces/life-event.interface.js';

export type LifeEventStatus = 'pending' | 'resolved' | 'expired';

@Entity('life_events')
@Index('life_events_character_status', ['characterId', 'status'])
@Index('life_events_character_event', ['characterId', 'eventId', 'createdAtGame'])
export class LifeEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 64 })
  eventId: string;

  @Column({ type: 'varchar', length: 12, default: 'pending' })
  status: LifeEventStatus;

  @Column({ type: 'jsonb', default: {} })
  params: LifeEventParams;

  @Column({ type: 'bigint', transformer: bigintNumber })
  createdAtGame: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  expiresAtGame: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  choiceId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  outcome: LifeEventOutcome | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
