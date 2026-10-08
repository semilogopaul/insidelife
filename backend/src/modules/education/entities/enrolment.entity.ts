import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { DegreeClassId, EnrolmentStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

export interface SemesterRecord {
  readonly session: number;
  readonly semester: number;
  readonly level: number;
  readonly gpa: number;
  readonly attendance: number;
  readonly mastery: number;
  readonly endedAt: number;
}

/**
 * A university or polytechnic programme, from acceptance to graduation. Progress is counted in "effective" minutes
 * (days not lost to strikes or suspension), so strikes push every later milestone back automatically.
 */
@Entity('education_enrolments')
@Index('education_enrolments_character_status', ['characterId', 'status'])
export class EnrolmentEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'uuid' })
  applicationId: string;

  @Column({ type: 'varchar', length: 32 })
  institutionId: string;

  @Column({ type: 'varchar', length: 32 })
  courseId: string;

  @Column({ type: 'varchar', length: 12 })
  status: EnrolmentStatus;

  /** Year of study (1 = 100L). */
  @Column({ type: 'int', default: 1 })
  level: number;

  @Column({ type: 'int', default: 1 })
  session: number;

  @Column({ type: 'int', default: 1 })
  semester: number;

  @Column({ type: 'int', default: 0 })
  completedSemesters: number;

  /** Carry-over semesters added after a CGPA below 1.00. */
  @Column({ type: 'int', default: 0 })
  extraSemesters: number;

  /** First day of lectures (1st of the month after acceptance). */
  @Column({ type: 'bigint', transformer: bigintNumber })
  startsAt: number;

  /** Effective (non-strike, non-suspended) minutes of programme completed. */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  progressMinutes: number;

  /** Minutes lost to suspension (for the graduation estimate). */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  pausedMinutes: number;

  /** Current semester mastery points. */
  @Column({ type: 'real', default: 0 })
  mastery: number;

  @Column({ type: 'int', default: 0 })
  lectureMinutesScheduled: number;

  @Column({ type: 'int', default: 0 })
  lectureMinutesAttended: number;

  @Column({ type: 'jsonb', default: [] })
  semesterResults: SemesterRecord[];

  @Column({ type: 'real', nullable: true })
  cgpa: number | null;

  /** Outstanding fees for the current session (frozen when they fall due). */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  feesDue: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  feesDueAt: number | null;

  @Column({ type: 'int', default: 0 })
  feesPaidSessions: number;

  @Column({ type: 'boolean', default: false })
  sponsoredFirstSession: boolean;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  suspendedAt: number | null;

  /** Whether the last day end saw this campus on strike (for strike start/end notices). */
  @Column({ type: 'boolean', default: false })
  onStrike: boolean;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  graduatedAt: number | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  degreeClass: DegreeClassId | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  endedAt: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
