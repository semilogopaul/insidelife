import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { ProfileLocationVisibility, SocialBadgeId } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * Public profile cache, refreshed by SocialSystem (every game day and, throttled, on settle). Holds what other
 * domains know about a character (job title, degree, children) so lists and leaderboards never fan out to every
 * domain per row. Also stores the player's social privacy settings (never overwritten by refreshes).
 */
@Entity('social_profiles')
export class SocialProfileEntity {
  @PrimaryColumn({ type: 'uuid' })
  characterId: string;

  @Column({ type: 'varchar', length: 96, nullable: true })
  title: string | null;

  @Column({ type: 'jsonb', default: [] })
  badges: SocialBadgeId[];

  /** "B.Sc, First Class · University of Lagos". */
  @Column({ type: 'varchar', length: 120, nullable: true })
  degreeLabel: string | null;

  /** Best CGPA among completed degrees; null for non-graduates. */
  @Index()
  @Column({ type: 'real', nullable: true })
  bestCgpa: number | null;

  @Column({ type: 'int', default: 0 })
  childrenCount: number;

  @Column({ type: 'boolean', default: false })
  married: boolean;

  @Index()
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  monthlyIncome: number;

  /** max(0, netWorth − unearnedTotal) at the last refresh (leaderboards read the live characters row). */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  selfMadeNetWorth: number;

  @Column({ type: 'int', default: 0 })
  friendCount: number;

  /** Ended parties with a real turnout. */
  @Column({ type: 'int', default: 0 })
  partiesHosted: number;

  @Column({ type: 'boolean', default: false })
  showExactWealth: boolean;

  @Column({ type: 'varchar', length: 8, default: 'friends' })
  locationVisibility: ProfileLocationVisibility;

  /** Game minute of the last refresh (throttles refresh-on-settle). */
  @Column({ type: 'bigint', default: 0, transformer: bigintNumber })
  refreshedAtGame: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
