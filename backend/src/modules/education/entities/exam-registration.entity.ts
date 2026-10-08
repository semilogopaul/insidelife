import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { ExamKind, ExamRegistrationStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';
import type { StoredWaecSubject } from './waec-result.entity.js';

/** A JAMB UTME or WAEC GCE registration, from payment at the CBT centre to the released result. */
@Entity('education_exam_registrations')
@Index('education_exam_registrations_character_kind', ['characterId', 'kind', 'registeredAt'])
export class ExamRegistrationEntity {
  /** Assigned before insert so the fee posting can use it as its idempotency key. */
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 12 })
  kind: ExamKind;

  /** 1st, 2nd… attempt at this exam kind (seeds the result, so a sitting can never be re-rolled). */
  @Column({ type: 'int' })
  attempt: number;

  @Column({ type: 'varchar', length: 12 })
  status: ExamRegistrationStatus;

  /** CBT centre where the paper is written. */
  @Column({ type: 'varchar', length: 64 })
  venueId: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  registeredAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  earliestSittingAt: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  institutionId: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  courseId: string | null;

  /** Study hours logged since registering. */
  @Column({ type: 'real', default: 0 })
  prepHours: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  fee: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  sittingStartedAt: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  writtenAt: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  resultAt: number | null;

  /** UTME score, hidden until released. */
  @Column({ type: 'int', nullable: true })
  score: number | null;

  /** GCE grades, hidden until released. */
  @Column({ type: 'jsonb', nullable: true })
  gceSubjects: StoredWaecSubject[] | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
