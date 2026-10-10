import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * One character's net worth at the start of a game day, for Fobes' risers and fallers. Kept light: the daily top 100
 * (with their rank, taken by `FobesSnapshotsService` from a world tick) plus a row for anyone who opens Fobes (rank
 * null), so their own "this week" works outside the top 100. Pruned after `FOBES_SNAPSHOT_RETENTION_DAYS`.
 */
@Entity('fobes_snapshots')
@Index('fobes_snapshots_character_day', ['characterId', 'day'])
export class FobesSnapshotEntity {
  /** Game day index (`dayIndexOf`). */
  @PrimaryColumn({ type: 'int' })
  day: number;

  @PrimaryColumn({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'bigint', transformer: bigintNumber })
  netWorth: number;

  /** Rank on that day's rich list (top 100); null for a viewer's own row outside it. */
  @Column({ type: 'int', nullable: true })
  rank: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
