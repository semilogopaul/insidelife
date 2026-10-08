import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { AdmissionStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** Post-UTME application to one institution and course. */
@Entity('education_admission_applications')
@Index('education_admission_applications_character_status', ['characterId', 'status'])
export class AdmissionApplicationEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  /** JAMB registration whose score was used (null for HND direct entry). */
  @Column({ type: 'uuid', nullable: true })
  examRegistrationId: string | null;

  @Column({ type: 'varchar', length: 32 })
  institutionId: string;

  @Column({ type: 'varchar', length: 32 })
  courseId: string;

  @Column({ type: 'varchar', length: 12 })
  status: AdmissionStatus;

  @Column({ type: 'int', nullable: true })
  utmeScore: number | null;

  /** Entry points used instead of UTME/8 for HND direct entry (ND CGPA × 10). */
  @Column({ type: 'real', nullable: true })
  entryPoints: number | null;

  /** Rolled at application, revealed with the decision. */
  @Column({ type: 'real' })
  screeningScore: number;

  @Column({ type: 'real', nullable: true })
  aggregate: number | null;

  @Column({ type: 'real' })
  cutoff: number;

  @Column({ type: 'real', default: 0 })
  catchmentBonus: number;

  @Column({ type: 'boolean', default: false })
  supplementaryList: boolean;

  @Column({ type: 'bigint', transformer: bigintNumber })
  feePaid: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  appliedAt: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  decisionAt: number;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  decidedAt: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  acceptBy: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
