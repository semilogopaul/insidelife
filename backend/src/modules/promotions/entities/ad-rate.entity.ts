import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { RateCardKey } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/**
 * An ops override of a catalog ad price (`AD_RATE_DEFINITIONS`), or of the ₦ per $1 rate dollar payments use
 * (`usd-rate`, kobo per $1). No row = the catalog default applies. Rows only change future quotes: every campaign,
 * club order and payment stores the amount (and rate) it was quoted and charged.
 */
@Entity('ad_rates')
export class AdRateEntity {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  key: RateCardKey;

  /** Real money in kobo: per 7-day block (a base rate for district-scaled kinds), or per club song. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  priceKobo: number;

  /** The admin who set it (null for system changes). */
  @Column({ type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  reason: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
