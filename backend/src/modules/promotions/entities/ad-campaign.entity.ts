import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { BillboardSlotId, IsoDate, PromotionStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** A paid billboard booking: one creative on one slot for whole Lagos calendar days. */
@Entity('promotion_campaigns')
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

  /** Real money charged, kobo. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  amountKobo: number;

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

  @Column({ type: 'bigint', transformer: bigintNumber, default: 0 })
  impressions: number;

  @Column({ type: 'bigint', transformer: bigintNumber, default: 0 })
  clicks: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
