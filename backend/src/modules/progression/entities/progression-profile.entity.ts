import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/** One row per character: chapter, permanent progression clout and the bookkeeping observers need. */
@Entity('progression_profiles')
export class ProgressionProfileEntity {
  @PrimaryColumn({ type: 'uuid' })
  characterId: string;

  /** Current Life Goals chapter (first chapter with required goals left). */
  @Column({ type: 'int', default: 1 })
  chapter: number;

  @Column({ type: 'boolean', default: false })
  legacyComplete: boolean;

  /** Permanent clout granted by goals and achievements (capped). Contributes to the status baseline. */
  @Column({ type: 'int', default: 0 })
  clout: number;

  /** `<jobId>|<title>` last observed, to spot promotions. */
  @Column({ type: 'varchar', length: 160, nullable: true })
  jobKey: string | null;

  /** Earned income total at the last month end, to spot the first salary. */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  earnedMark: number;

  /** Last game day whose state was probed through the domain ports. */
  @Column({ type: 'int', nullable: true })
  lastProbedDay: number | null;

  /** Game minute the profile was created. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  seededAt: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
