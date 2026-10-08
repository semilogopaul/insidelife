import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/** A per-character tally or flag (`action:eat-buka`, `trip:danfo`, `venue:cbt-yaba`, `outside`…). */
@Entity('progression_counters')
export class ProgressionCounterEntity {
  @PrimaryColumn({ type: 'uuid' })
  characterId: string;

  @PrimaryColumn({ type: 'varchar', length: 80 })
  key: string;

  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  value: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
