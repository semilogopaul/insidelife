import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { PromotionStatus } from '@insidelife/shared';

export type ModerationSubjectType = 'campaign' | 'club-order';

export type ModerationAction =
  | 'paid'
  | 'approved'
  | 'rejected'
  | 'refund-flagged'
  | 'refunded'
  | 'cancelled'
  | 'checkout-failed'
  | 'duplicate-payment'
  | 'refund-failed'
  /** Our refund was accepted by the gateway and is processing. */
  | 'refund-sent';

/** Append-only audit trail of every payment and moderation decision on promotions. */
@Entity('promotion_moderation_log')
@Index('promotion_moderation_log_subject', ['subjectType', 'subjectId', 'createdAt'])
export class ModerationLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  subjectType: ModerationSubjectType;

  @Column({ type: 'uuid' })
  subjectId: string;

  @Column({ type: 'varchar', length: 24 })
  action: ModerationAction;

  @Column({ type: 'varchar', length: 16, nullable: true })
  fromStatus: PromotionStatus | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  toStatus: PromotionStatus | null;

  /** Admin user id; null for system actions (payments, automatic refunds). */
  @Column({ type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  paymentReference: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
