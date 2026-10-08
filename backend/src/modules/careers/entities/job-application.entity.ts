import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { JobApplicationStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** One application to one job. Decided at the end of the `decideAt` game day; never re-rolled. */
@Entity('job_applications')
@Index('job_applications_character_status', ['characterId', 'status'])
@Index('job_applications_character_job', ['characterId', 'jobId', 'appliedAt'])
export class JobApplicationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 48 })
  jobId: string;

  /** `pending` → (`interview`) → `accepted` | `rejected`. */
  @Column({ type: 'varchar', length: 12 })
  status: JobApplicationStatus;

  @Column({ type: 'bigint', transformer: bigintNumber })
  appliedAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  decideAt: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  decidedAt: number | null;

  /** How the interview card went (-0.2…+0.25 on the odds). */
  @Column({ type: 'real', default: 0 })
  interviewBonus: number;

  /** The interview life-event card has been dealt. */
  @Column({ type: 'boolean', default: false })
  interviewCardDealt: boolean;

  @Column({ type: 'varchar', length: 240, nullable: true })
  message: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
