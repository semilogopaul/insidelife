import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { PaymentEntity } from '../entities/payment.entity.js';
import type { GatewayCharge, GatewayChargeStatus, GatewayInitializeInput, PaymentGateway } from './payment-gateway.interface.js';

/** Where the frontend renders the fake checkout. */
export const sandboxCheckoutUrl = (reference: string): string => `/payments/sandbox?reference=${encodeURIComponent(reference)}`;

/**
 * Local stand-in for Paystack (development without a secret key). The "customer" decides on the fake checkout page
 * via `POST /v1/payments/sandbox/:reference/{succeed|fail}`; verify then reports what was decided. Never enabled in
 * production unless ALLOW_PAYMENT_SANDBOX is set (config validation).
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
    return {
      reference,
      status,
      amountKobo: payment.amountKobo,
      currency: payment.currency,
      channel: 'sandbox',
      paidAt: payment.verifiedAt,
      details: { sandbox: true, status },
    };
  }

  /** The charge the fake checkout produces when the player taps Pay / Decline. */
  simulatedCharge(payment: PaymentEntity, outcome: 'success' | 'failed'): GatewayCharge {
    return {
      reference: payment.reference,
      status: outcome,
      amountKobo: payment.amountKobo,
      currency: payment.currency,
      channel: 'sandbox',
      paidAt: outcome === 'success' ? new Date() : null,
      details: { sandbox: true, status: outcome },
    };
  }
}
