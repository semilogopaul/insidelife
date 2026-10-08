import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { ClubPlayProductId, IsoDate, PromotionStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** A paid club rotation for one track: one club or all clubs, for whole Lagos calendar days. */
@Entity('promotion_club_orders')
@Index('promotion_club_orders_track_created', ['trackId', 'createdAt'])
@Index('promotion_club_orders_owner_created', ['ownerUserId', 'createdAt'])
@Index('promotion_club_orders_status_window', ['status', 'startDate', 'endDate'])
@Index('promotion_club_orders_payment_reference', ['paymentReference'], { unique: true, where: 'payment_reference IS NOT NULL' })
export class ClubPlayOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  trackId: string;

  @Column({ type: 'uuid' })
  ownerUserId: string;

  @Column({ type: 'uuid', nullable: true })
  ownerCharacterId: string | null;

  @Column({ type: 'varchar', length: 24 })
  productId: ClubPlayProductId;

  @Column({ type: 'boolean', default: false })
  allClubs: boolean;

  /** Venue ids (empty when `allClubs`). */
  @Column({ type: 'varchar', length: 64, array: true, default: () => "'{}'" })
  clubs: string[];

  @Column({ type: 'date' })
  startDate: IsoDate;

  /** Exclusive. */
  @Column({ type: 'date' })
  endDate: IsoDate;

  @Column({ type: 'smallint' })
  days: number;

  @Column({ type: 'bigint', transformer: bigintNumber })
  amountKobo: number;

  @Column({ type: 'varchar', length: 16 })
  status: PromotionStatus;

  @Column({ type: 'varchar', length: 300, nullable: true })
  rejectionReason: string | null;

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
  plays: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
