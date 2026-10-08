import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { PaymentStatus } from '@insidelife/shared';
import type { CheckoutPurpose } from '../../../common/ports/checkout.port.js';
import { bigintNumber } from '../../../database/transformers.js';
import type { GatewayDetails, GatewayProvider } from '../gateways/payment-gateway.interface.js';

/**
 * One real-money checkout (Paystack or the local sandbox). The reference is the idempotency anchor for everything:
 * Paystack's transaction, the ledger credit (`topup:<reference>`) and the fulfilment.
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

  /** Real money in kobo. */
  @Column({ type: 'bigint', transformer: bigintNumber })
  amountKobo: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: 'NGN';

  @Column({ type: 'varchar', length: 10 })
  provider: GatewayProvider;

  @Column({ type: 'varchar', length: 12, default: 'initialized' })
  status: PaymentStatus;

  @Column({ type: 'varchar', length: 32, nullable: true })
  channel: string | null;

  /** Sanitised gateway response (no secrets, no authorization codes, no card data). */
  @Column({ type: 'jsonb', nullable: true })
  gatewayResponse: GatewayDetails | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /** When the gateway confirmed the charge. */
  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  /** When the purchase was delivered by its fulfiller. */
  @Column({ type: 'timestamptz', nullable: true })
  fulfilledAt: Date | null;

  @Column({ type: 'int', default: 0 })
  fulfillmentAttempts: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  lastFulfillmentError: string | null;
}
