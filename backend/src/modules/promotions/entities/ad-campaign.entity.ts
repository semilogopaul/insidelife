import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { BillboardSlotId, IsoDate, PaymentCurrency, PromotionStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** A paid billboard booking: one creative on one slot for whole Lagos calendar days. */
@Entity('promotion_campaigns')
// The charge is the naira price (NGN), or at least its value in cents at a sane rate (USD, rounded up).
@Check('promotion_campaigns_charge', `("currency" = 'NGN' AND "ngn_per_usd" IS NULL AND "charge_minor" = "amount_kobo") OR ("currency" = 'USD' AND "ngn_per_usd" BETWEEN 500 AND 5000 AND "charge_minor" * "ngn_per_usd" >= "amount_kobo")`)
@Index('promotion_campaigns_owner_created', ['ownerUserId', 'createdAt'])
@Index('promotion_campaigns_slot_window', ['slotId', 'status', 'startDate', 'endDate'])
@Index('promotion_campaigns_status_start', ['status', 'startDate'])
@Index('promotion_campaigns_payment_reference', ['paymentReference'], { unique: true, where: 'payment_reference IS NOT NULL' })
export class AdCampaignEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  ownerUserId: string;

  /** The buyer's living character when they booked (notifications go to their living character at the time). */
  @Column({ type: 'uuid', nullable: true })
  ownerCharacterId: string | null;

  @Column({ type: 'varchar', length: 32 })
  slotId: BillboardSlotId;

  @Column({ type: 'varchar', length: 80 })
  title: string;

  /** Phone apps: the one-line pitch under the app name. */
  @Column({ type: 'varchar', length: 90, nullable: true })
  tagline: string | null;

  @Column({ type: 'varchar', length: 200 })
  creativeKey: string;

  @Column({ type: 'varchar', length: 500 })
  creativeUrl: string;

  @Column({ type: 'varchar', length: 500 })
  linkUrl: string;

  @Column({ type: 'date' })
  startDate: IsoDate;

  /** Exclusive. */
  @Column({ type: 'date' })
  endDate: IsoDate;

  @Column({ type: 'smallint' })
  days: number;

  /** Days per block it was sold in (7, or 3 for slots of ₦35,000 a week or more at booking time). */
  @Column({ type: 'smallint', default: 7 })
  blockDays: number;

  /** The naira price quoted at booking, kobo (later rate changes never touch it). */
  @Column({ type: 'bigint', transformer: bigintNumber })
  amountKobo: number;

  /** What the booking is charged in: NGN, or USD when the buyer chose dollars. */
  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: PaymentCurrency;

  /**
   * The charge in `currency`'s minor units, fixed at booking: kobo for NGN (= `amountKobo`), for USD the naira price
   * ÷ `ngnPerUsd` in cents rounded up (`usdCentsForKobo`). The payment must be for this exact currency and amount.
   */
  @Column({ type: 'bigint', transformer: bigintNumber })
  chargeMinor: number;

  /** Dollar bookings: the ₦ per $1 the price was converted at (null for naira). */
  @Column({ type: 'integer', nullable: true })
  ngnPerUsd: number | null;

  @Column({ type: 'varchar', length: 16 })
  status: PromotionStatus;

  @Column({ type: 'varchar', length: 300, nullable: true })
  rejectionReason: string | null;

  /** The slot is held for this checkout until then. */
  @Column({ type: 'timestamptz', nullable: true })
  holdExpiresAt: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  paymentReference: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  checkoutUrl: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy: string | null;

  /** Views: a player who saw it (see shared `ad-views.ts`), once per game hour each. */
  @Column({ type: 'bigint', transformer: bigintNumber, default: 0 })
  impressions: number;

  /** Different players who saw it. */
  @Column({ type: 'integer', default: 0 })
  uniqueViewers: number;

  @Column({ type: 'bigint', transformer: bigintNumber, default: 0 })
  clicks: number;

  /** The "now live" / "has ended" notices went out (each exactly once). */
  @Column({ type: 'timestamptz', nullable: true })
  liveNotifiedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedNotifiedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
