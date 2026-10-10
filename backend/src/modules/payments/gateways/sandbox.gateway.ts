import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { PaymentEntity } from '../entities/payment.entity.js';
import type {
  GatewayCharge,
  GatewayChargeStatus,
  GatewayInitializeInput,
  GatewayRefund,
  GatewayRefundInput,
  PaymentGateway,
} from './payment-gateway.interface.js';

/** Where the frontend renders the fake checkout. */
export const sandboxCheckoutUrl = (reference: string): string => `/payments/sandbox?reference=${encodeURIComponent(reference)}`;

/**
 * Local stand-in for Flutterwave (development without a secret key). The "customer" decides on the fake checkout page
 * via `POST /v1/payments/sandbox/:reference/{succeed|fail}`; verify then reports what was decided, and refunds are
 * accepted instantly. Pays in whatever currency the checkout charges (naira or dollars; wallets show the same fake
 * page). Never enabled in production unless ALLOW_PAYMENT_SANDBOX is set (config validation).
 */
@Injectable()
export class SandboxGateway implements PaymentGateway {
  readonly provider = 'sandbox' as const;

  constructor(@InjectRepository(PaymentEntity) private readonly payments: Repository<PaymentEntity>) {}

  async initialize(input: GatewayInitializeInput): Promise<{ readonly authorizationUrl: string }> {
    return { authorizationUrl: sandboxCheckoutUrl(input.reference) };
  }

  async verify(reference: string): Promise<GatewayCharge | null> {
    const payment = await this.payments.findOne({ where: { reference } });
    if (!payment) return null;
    const status: GatewayChargeStatus = payment.status === 'initialized' ? 'pending' : payment.status;
    return this.charge(payment, status);
  }

  /** The sandbox has no transaction ids of its own: the redirect never carries one. */
  async verifyTransaction(): Promise<GatewayCharge | null> {
    return null;
  }

  async refund(input: GatewayRefundInput): Promise<GatewayRefund> {
    const payment = await this.payments.findOne({ where: { reference: input.reference } });
    return { refundId: `sandbox-${input.reference.slice(0, 8)}`, amountMinor: input.amountMinor ?? payment?.amountMinor ?? 0, status: 'completed' };
  }

  /** The charge the fake checkout produces when the player taps Pay / Decline. */
  simulatedCharge(payment: PaymentEntity, outcome: 'success' | 'failed'): GatewayCharge {
    return { ...this.charge(payment, outcome), paidAt: outcome === 'success' ? new Date() : null };
  }

  private charge(payment: PaymentEntity, status: GatewayChargeStatus): GatewayCharge {
    return {
      reference: payment.reference,
      transactionId: null,
      status,
      amountMinor: payment.amountMinor,
      chargedAmountMinor: payment.amountMinor,
      currency: payment.currency,
      channel: 'sandbox',
      paidAt: payment.verifiedAt,
      details: { sandbox: true, status },
    };
  }
}
