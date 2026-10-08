import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { MilestoneStatDto } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** A pending (or acknowledged) full-screen celebration. */
@Entity('progression_milestones')
@Index('progression_milestones_character_dedupe', ['characterId', 'dedupeKey'], { unique: true })
@Index('progression_milestones_character_pending', ['characterId', 'acknowledgedAt'])
export class MilestoneMomentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 32 })
  momentId: string;

  /** One-time moments use their id; repeatable ones add the occurrence (`promotion:<job>:<title>`). */
  @Column({ type: 'varchar', length: 160 })
  dedupeKey: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 500 })
  body: string;

  @Column({ type: 'varchar', length: 40 })
  icon: string;

  @Column({ type: 'varchar', length: 200 })
  shareText: string;

  @Column({ type: 'jsonb', default: [] })
  stats: MilestoneStatDto[];

  @Column({ type: 'bigint', transformer: bigintNumber })
  gameMinute: number;

  @Column({ type: 'timestamptz', nullable: true })
  acknowledgedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
