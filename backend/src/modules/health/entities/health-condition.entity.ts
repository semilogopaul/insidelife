import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { ConditionId, ConditionSeverity, HealthConditionStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** One illness, injury, chronic condition or pregnancy a character has (or had — recovered rows are history). */
@Entity('health_conditions')
@Index('health_conditions_character_status', ['characterId', 'status'])
export class HealthConditionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 24 })
  conditionId: ConditionId;

  @Column({ type: 'varchar', length: 10 })
  severity: ConditionSeverity;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: HealthConditionStatus;

  @Column({ type: 'bigint', transformer: bigintNumber })
  onsetAt: number;

  @Column({ type: 'boolean', default: false })
  diagnosed: boolean;

  /** Last successful treatment. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  treatedAt: number | null;

  /** When it became critical (untreated); drives the grace period before it can prove fatal. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  criticalSince: number | null;

  /** Critical-stage warnings delivered while the player was watching (an illness death needs some). */
  @Column({ type: 'int', default: 0 })
  warningsSeen: number;

  /** Chronic conditions: medication paid up to this time. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  managedUntil: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  resolvedAt: number | null;

  /** How it started (`season`, `street-food`, `okada`, `birthday-check`, `event`, `port`…). */
  @Column({ type: 'varchar', length: 32 })
  source: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
