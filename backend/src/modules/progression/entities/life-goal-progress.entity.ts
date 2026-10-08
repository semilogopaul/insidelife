import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { LifeGoalStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** A character's progress on one Life Goal. */
@Entity('progression_goals')
@Index('progression_goals_character_goal', ['characterId', 'goalId'], { unique: true })
export class LifeGoalProgressEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 48 })
  goalId: string;

  @Column({ type: 'int' })
  chapter: number;

  @Column({ type: 'varchar', length: 12 })
  status: LifeGoalStatus;

  /** Which branch completed a branching goal. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  pathId: string | null;

  /** Game minute of completion. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  completedAt: number | null;

  @Column({ type: 'boolean', default: false })
  rewarded: boolean;

  @Column({ type: 'int', default: 0 })
  rewardCash: number;

  @Column({ type: 'int', default: 0 })
  rewardClout: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
