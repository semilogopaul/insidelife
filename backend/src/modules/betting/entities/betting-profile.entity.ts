import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * A player's responsible-play settings, per account (the real person), so they carry over to an heir: their own daily
 * loss limit (and a raise waiting out its cooling-off), a self-exclusion end that can only move later, and the
 * reality-check interval.
 */
@Entity('betting_profiles')
export class BettingProfileEntity {
  @PrimaryColumn('uuid')
  userId: string;

  /** Null = the server's maximum (BETTING_DAILY_LOSS_LIMIT). */
  @Column({ type: 'bigint', transformer: bigintNumber, nullable: true })
  dailyLossLimit: number | null;

  @Column({ type: 'bigint', transformer: bigintNumber, nullable: true })
  pendingLossLimit: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  pendingLimitAt: Date | null;

  /** Real time. While it's in the future, no bets (open slips still settle and pay). */
  @Column({ type: 'timestamptz', nullable: true })
  excludedUntil: Date | null;

  @Column({ type: 'int', default: 30 })
  realityCheckMinutes: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
