import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { WaecGrade, WaecSubjectId } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

export interface StoredWaecSubject {
  readonly subjectId: WaecSubjectId;
  readonly grade: WaecGrade;
  /** Raw score (server only — the client sees grades). */
  readonly score: number;
}

/** One released WAEC sitting: the school WAEC at 17, then any GCE resits. */
@Entity('education_waec_results')
@Index('education_waec_results_character_sitting', ['characterId', 'sitting'], { unique: true })
export class WaecResultEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 8 })
  kind: 'waec' | 'gce';

  /** 1 = school WAEC, 2+ = GCE. */
  @Column({ type: 'int' })
  sitting: number;

  @Column({ type: 'jsonb' })
  subjects: StoredWaecSubject[];

  @Column({ type: 'int' })
  credits: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  releasedAt: number;

  /** GCE registration that produced this result. */
  @Column({ type: 'uuid', nullable: true })
  registrationId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
