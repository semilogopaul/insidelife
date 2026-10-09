import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { PaymentStatus } from '@insidelife/shared';
import type { CheckoutPurpose } from '../../../common/ports/checkout.port.js';
import { bigintNumber } from '../../../database/transformers.js';
import type { GatewayDetails, GatewayProvider } from '../gateways/payment-gateway.interface.js';

/**
 * Refund lifecycle of a successful payment: `due` (we owe it, not sent yet) → `sending` (claimed, gateway call in
 * flight) → `pending` (the gateway took it and is processing it) → `refunded` (the gateway says completed: final) or
 * `failed` (refused, or reported failed later: ops refund by hand). A refund made in the gateway dashboard arrives by
 * webhook as `pending` or `refunded`.
 */
export type PaymentRefundStatus = 'due' | 'sending' | 'pending' | 'refunded' | 'failed';

/**
 * One real-money checkout (Flutterwave or the local sandbox). The reference is the idempotency anchor for everything:
 * Flutterwave's `tx_ref`, the ledger credit (`topup:<reference>`), the fulfilment and the refund.
 */
@Entity('payments')
@Index('payments_user_created', ['userId', 'createdAt'])
@Index('payments_status_created', ['status', 'createdAt'])
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  reference: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  characterId: string | null;

  @Column({ type: 'varchar', length: 16 })
  purpose: CheckoutPurpose;

  /** Package id, ad campaign id or club-play order id. */
  @Column({ type: 'varchar', length: 64 })
  subjectId: string;

  @Column({ type: 'varchar', length: 120 })
  description: string;

  /** Real money in kobo: the price quoted at checkout. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  amountKobo: number;

  /** Real money the gateway verified as paid (≥ `amountKobo`); null until a charge is confirmed. */
  @Column({ type: 'bigint', transformer: bigintNumber, nullable: true })
  paidKobo: number | null;

  /** Top-ups: game naira per real ₦1 quoted at checkout (null for other purposes and older top-ups). */
  @Column({ type: 'integer', nullable: true })
  topupRate: number | null;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: 'NGN';

  @Column({ type: 'varchar', length: 16 })
  provider: GatewayProvider;

  @Column({ type: 'varchar', length: 12, default: 'initialized' })
  status: PaymentStatus;

  /** The gateway's transaction id (Flutterwave `data.id`), recorded when a charge is verified. Refunds need it. */
  @Index('payments_gateway_transaction', { where: '"gateway_transaction_id" IS NOT NULL' })
  @Column({ type: 'varchar', length: 32, nullable: true })
  gatewayTransactionId: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  channel: string | null;

  /** Sanitised gateway response (no secrets, no tokens, no card data). */
  @Column({ type: 'jsonb', nullable: true })
  gatewayResponse: GatewayDetails | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /** When the gateway confirmed the charge. */
  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  /** When the purchase was delivered by its fulfiller (or settled as a refund). */
  @Column({ type: 'timestamptz', nullable: true })
  fulfilledAt: Date | null;

  @Column({ type: 'int', default: 0 })
  fulfillmentAttempts: number;

  /** Gateway checks the reconciler has made on this unconfirmed checkout (see `CHECK_SCHEDULE_MINUTES`). */
  @Column({ type: 'int', default: 0 })
  checkAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastCheckedAt: Date | null;

  /**
   * When the reconciler should next look at this row: re-check an unconfirmed checkout with the gateway, or retry
   * delivering a paid one. Null = nothing scheduled.
   */
  @Index('payments_next_check', { where: '"next_check_at" IS NOT NULL' })
  @Column({ type: 'timestamptz', nullable: true })
  nextCheckAt: Date | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  lastFulfillmentError: string | null;

  @Index('payments_refund_status', { where: '"refund_status" IS NOT NULL' })
  @Column({ type: 'varchar', length: 12, nullable: true })
  refundStatus: PaymentRefundStatus | null;

  /** Why we owe or sent the refund (moderation rejection, slot filled…) or "Refunded in the Flutterwave dashboard". */
  @Column({ type: 'varchar', length: 200, nullable: true })
  refundReason: string | null;

  /** Real money refunded, in kobo. */
  @Column({ type: 'bigint', transformer: bigintNumber, default: 0 })
  refundedKobo: number;

  /** The gateway's refund id. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  refundId: string | null;

  /** The gateway's own refund status (`completed`, `processing`, `failed`…), as last reported. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  refundGatewayStatus: string | null;

  /** When the refund state last changed (claimed, sent, reported): finds stuck `sending` and stale `pending` refunds. */
  @Column({ type: 'timestamptz', nullable: true })
  refundUpdatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  refundedAt: Date | null;

  /** Why the automatic refund failed (ops then refund by hand). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  refundFailure: string | null;

  /** Needs a human look (e.g. a delivered top-up refunded from the dashboard whose coins were already spent). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  flagReason: string | null;
}
