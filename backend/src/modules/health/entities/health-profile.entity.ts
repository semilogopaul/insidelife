import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { HealthDriftBreakdown } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * Timed protections bought through life events: a bed net (when the shop can't supply one), fumigation, a trusted
 * pharmacy, a low-salt diet, a first-aid kit.
 */
export const HEALTH_PROTECTIONS = ['bed-net', 'fumigated', 'trusted-pharmacy', 'low-salt', 'first-aid'] as const;
export type HealthProtection = (typeof HEALTH_PROTECTIONS)[number];
export type HealthProtections = Partial<Record<HealthProtection, number>>;

/** Per-character health bookkeeping that isn't a condition: streaks, protections, yesterday's drift breakdown. */
@Entity('health_profiles')
export class HealthProfileEntity {
  @PrimaryColumn({ type: 'uuid' })
  characterId: string;

  /** Consecutive day-ends with at least one need below 15. */
  @Column({ type: 'int', default: 0 })
  lowNeedStreak: number;

  /** Consecutive stressful days (low mood, heavy job stress); feeds burnout. */
  @Column({ type: 'int', default: 0 })
  stressStreak: number;

  /** Game minute each protection lasts until. */
  @Column({ type: 'jsonb', default: {} })
  protections: HealthProtections;

  @Column({ type: 'jsonb', nullable: true })
  lastDrift: HealthDriftBreakdown | null;

  /** Last time family paid an emergency bill (they help at most once a game month). */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  familyRescueAt: number | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
