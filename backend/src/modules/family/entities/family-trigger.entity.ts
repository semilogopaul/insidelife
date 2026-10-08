import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

export type FamilyTriggerStatus = 'queued' | 'delivered' | 'expired';
export type FamilyTriggerParams = Readonly<Record<string, string | number | boolean>>;

/**
 * Something that happened in the family and must reach the player as a life-event card (a black-tax request, a
 * funeral, a naming ceremony, a child sent home). The family system queues it; the matching life event is eligible
 * while it is queued and takes it when the card is dealt.
 */
@Entity('family_triggers')
@Index('family_triggers_character_status', ['characterId', 'status'])
@Index('family_triggers_dedupe', ['characterId', 'dedupeKey'], { unique: true })
export class FamilyTriggerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  /** Life event definition id. */
  @Column({ type: 'varchar', length: 64 })
  eventId: string;

  /** Deterministic key so a replayed settlement never queues the same fact twice. */
  @Column({ type: 'varchar', length: 120 })
  dedupeKey: string;

  @Column({ type: 'jsonb', default: {} })
  params: FamilyTriggerParams;

  @Column({ type: 'varchar', length: 12, default: 'queued' })
  status: FamilyTriggerStatus;

  @Column({ type: 'bigint', transformer: bigintNumber })
  createdAtGame: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  deliveredAtGame: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
