import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { MedicalRecordKind } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** Medical history: one line per diagnosis, treatment, admission, birth… (append-only). */
@Entity('medical_records')
@Index('medical_records_character_time', ['characterId', 'gameMinute'])
export class MedicalRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 20 })
  kind: MedicalRecordKind;

  @Column({ type: 'varchar', length: 24, nullable: true })
  conditionId: string | null;

  @Column({ type: 'varchar', length: 240 })
  summary: string;

  /** What the character paid (₦), 0 if nothing. */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  cost: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  venueId: string | null;

  @Column({ type: 'bigint', transformer: bigintNumber })
  gameMinute: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
