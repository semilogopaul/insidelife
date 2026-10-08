import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { ProgrammeEnrolmentStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** A professional programme attempt (Law School, ICAN level, bootcamp, IELTS…). */
@Entity('education_programme_enrolments')
@Index('education_programme_enrolments_character_status', ['characterId', 'status'])
export class ProgrammeEnrolmentEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 32 })
  programmeId: string;

  @Column({ type: 'varchar', length: 12 })
  status: ProgrammeEnrolmentStatus;

  @Column({ type: 'bigint', transformer: bigintNumber })
  feePaid: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  startedAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  endsAt: number;

  @Column({ type: 'real', default: 0 })
  prepHours: number;

  @Column({ type: 'int', default: 0 })
  classMinutesScheduled: number;

  @Column({ type: 'int', default: 0 })
  classMinutesAttended: number;

  /** IELTS band for scored exams. */
  @Column({ type: 'real', nullable: true })
  score: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  completedAt: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
