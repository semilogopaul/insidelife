import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { EmploymentEndReason } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** A finished employment: the CV. Also the source of "years of experience" requirements. */
@Entity('employment_history')
@Index('employment_history_character_ended', ['characterId', 'endedAt'])
export class EmploymentHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  /** The employment row this record replaced. */
  @Index({ unique: true })
  @Column({ type: 'uuid' })
  employmentId: string;

  @Column({ type: 'varchar', length: 48 })
  jobId: string;

  /** Final title held. */
  @Column({ type: 'varchar', length: 80 })
  title: string;

  @Column({ type: 'varchar', length: 80 })
  employer: string;

  @Column({ type: 'int' })
  finalLevel: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  startedAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  endedAt: number;

  @Column({ type: 'varchar', length: 16 })
  reason: EmploymentEndReason;

  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  totalEarned: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
