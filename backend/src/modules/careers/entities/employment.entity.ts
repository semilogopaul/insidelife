import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { PayslipDto } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** A payslip computed at month end but held back (government "salary delay"). */
export interface HeldPayslip extends PayslipDto {
  readonly payAt: number;
}

/**
 * The character's current job (at most one). When the job ends the row moves to `employment_history` and is
 * deleted, so payroll keys (`salary:<employmentId>:<month>`) stay unique per real-world employment.
 */
@Entity('employments')
@Index('employments_one_per_character', ['characterId'], { unique: true })
export class EmploymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 48 })
  jobId: string;

  /** Index into the job's ladder. */
  @Column({ type: 'int', default: 0 })
  level: number;

  /** First working day (start of the day after the offer). */
  @Column({ type: 'bigint', transformer: bigintNumber })
  startedAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  levelStartedAt: number;

  /** 0-1 rolling score: attendance × mood × skill fit. */
  @Column({ type: 'real', default: 0.7 })
  performance: number;

  /** -0.3…0.3: the boss's opinion of you from life events (decays daily). */
  @Column({ type: 'real', default: 0 })
  goodwill: number;

  /** Counter-offers and label deals adjust pay (1 = catalog pay). */
  @Column({ type: 'real', default: 1 })
  payAdjustment: number;

  /** Headhunted to a rival: shown instead of the catalog employer. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  employerOverride: string | null;

  // --- Attendance (this month / today) ---------------------------------------------------------------------------

  /** Month the monthly counters belong to. */
  @Column({ type: 'int' })
  monthIndex: number;

  @Column({ type: 'int', default: 0 })
  scheduledMinutesMonth: number;

  @Column({ type: 'int', default: 0 })
  workedMinutesMonth: number;

  @Column({ type: 'int', default: 0 })
  absentMinutesMonth: number;

  @Column({ type: 'int', default: 0 })
  lateMinutesMonth: number;

  @Column({ type: 'int', default: 0 })
  scheduledMinutesDay: number;

  @Column({ type: 'int', default: 0 })
  workedMinutesDay: number;

  @Column({ type: 'int', default: 0 })
  lateMinutesDay: number;

  /** Missed days pile up strikes; three strikes earns a query letter, three more after that and you're sacked. */
  @Column({ type: 'real', default: 0 })
  strikes: number;

  @Column({ type: 'int', default: 0 })
  warnings: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  lastWarningAt: number | null;

  // --- Leave -----------------------------------------------------------------------------------------------------

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  leaveFrom: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  leaveUntil: number | null;

  /** Calendar year the used-leave counter belongs to. */
  @Column({ type: 'int' })
  leaveYear: number;

  @Column({ type: 'int', default: 0 })
  leaveDaysUsed: number;

  // --- Promotion -------------------------------------------------------------------------------------------------

  @Column({ type: 'int', default: 0 })
  promotionAttempts: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  lastPromotionRequestAt: number | null;

  /** Level for which the "you're due for promotion" nudge was sent. */
  @Column({ type: 'int', default: -1 })
  promotionNotifiedLevel: number;

  /** Entry-level licence (housemanship → MDCN) already granted. */
  @Column({ type: 'boolean', default: false })
  licenceGranted: boolean;

  // --- Pay -------------------------------------------------------------------------------------------------------

  /** Net pay received from this employment. */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  totalEarned: number;

  @Column({ type: 'jsonb', nullable: true })
  lastPayslip: PayslipDto | null;

  @Column({ type: 'jsonb', nullable: true })
  heldPayslip: HeldPayslip | null;

  /** Next payroll is delayed by this many days (civil-service salary delay). */
  @Column({ type: 'int', default: 0 })
  salaryDelayDays: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
