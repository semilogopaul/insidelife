import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalServiceException } from '../../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../../config/configuration.js';
import {
  isAcceptedRefundStatus,
  isNotFound,
  parseEnvelope,
  parseHostedLink,
  parseRefund,
  parseTransaction,
  type FlutterwaveEnvelope,
  type ParsedRefund,
} from './flutterwave.parsers.js';
import type { GatewayCharge, GatewayInitializeInput, GatewayRefund, GatewayRefundInput, PaymentGateway } from './payment-gateway.interface.js';

const FLUTTERWAVE_API = 'https://api.flutterwave.com/v3';
const TIMEOUT_MS = 15_000;
/** Matches the promotions checkout hold: an unpaid hosted link dies with the hold. */
const SESSION_MINUTES = 30;

interface CallResult {
  readonly httpStatus: number;
  readonly envelope: FlutterwaveEnvelope | null;
}

/**
 * Thin Flutterwave v3 client: Standard (hosted) checkout, transaction verification and refunds. Cards never touch our
 * servers (no encryption key, no direct charges). The secret key never leaves this class and is never logged;
 * failures surface as `ExternalServiceException` (502) with no gateway internals.
 */
@Injectable()
export class FlutterwaveClient implements PaymentGateway {
  readonly provider = 'flutterwave' as const;
  private readonly logger = new Logger(FlutterwaveClient.name);
  private readonly secretKey: string;
  private readonly callbackUrl: string;
  /** Our logo on the hosted page; only over https (Flutterwave's page is https and would block anything else). */
  private readonly logoUrl: string | null;

  constructor(config: ConfigService<AppConfig, true>) {
    const payments = config.get('payments', { infer: true });
    this.secretKey = payments.flutterwave.secretKey;
    this.callbackUrl = payments.callbackUrl;
    const origin = URL.canParse(payments.callbackUrl) ? new URL(payments.callbackUrl).origin : '';
    this.logoUrl = origin.startsWith('https://') ? `${origin}/icons/icon-512.png` : null;
  }

  async initialize(input: GatewayInitializeInput): Promise<{ readonly authorizationUrl: string }> {
    const { envelope } = await this.call('POST', '/payments', {
      tx_ref: input.reference,
      amount: input.amountKobo / 100,
      currency: 'NGN',
      redirect_url: this.callbackUrl,
      customer: { email: input.email, name: input.customerName },
      customizations: { title: 'Inside Life', description: input.description, ...(this.logoUrl ? { logo: this.logoUrl } : {}) },
      meta: { ...input.metadata, paymentId: input.paymentId, kind: input.metadata.purpose ?? null },
      session_duration: SESSION_MINUTES,
    });
    const link = envelope?.ok ? parseHostedLink(envelope.data) : null;
    if (!link) {
      this.logger.warn({ reference: input.reference, message: envelope?.message ?? null }, 'Flutterwave checkout rejected');
      throw new ExternalServiceException('Flutterwave');
    }
    return { authorizationUrl: link };
  }

  verify(reference: string): Promise<GatewayCharge | null> {
    return this.readTransaction(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, { reference });
  }

  verifyTransaction(transactionId: string): Promise<GatewayCharge | null> {
    if (!/^\d{1,20}$/.test(transactionId)) return Promise.resolve(null);
    return this.readTransaction(`/transactions/${transactionId}/verify`, { transactionId });
  }

  async refund(input: GatewayRefundInput): Promise<GatewayRefund> {
    const transactionId = input.transactionId ?? (await this.verify(input.reference))?.transactionId ?? null;
    if (!transactionId) {
      this.logger.warn({ reference: input.reference }, 'Refund impossible: Flutterwave has no transaction for this reference');
      throw new ExternalServiceException('Flutterwave');
    }
    const body = { comments: input.comments.slice(0, 120), ...(input.amountKobo !== undefined ? { amount: input.amountKobo / 100 } : {}) };
    const { envelope } = await this.call('POST', `/transactions/${transactionId}/refund`, body, { allowClientErrors: true });
    const refund = envelope?.ok ? parseRefund(envelope.data) : null;
    if (!refund || !isAcceptedRefundStatus(refund.status)) {
      this.logger.warn({ reference: input.reference, message: envelope?.message ?? null, status: refund?.status ?? null }, 'Flutterwave refused the refund');
      throw new ExternalServiceException('Flutterwave');
    }
    return { refundId: refund.refundId, amountKobo: refund.amountKobo, status: refund.status };
  }

  /** `GET /v3/refunds/:id` — confirms a refund reported by a webhook. Null when Flutterwave doesn't know it. */
  async fetchRefund(refundId: string): Promise<ParsedRefund | null> {
    if (!/^\d{1,20}$/.test(refundId)) return null;
    const { envelope } = await this.call('GET', `/refunds/${refundId}`, undefined, { allowClientErrors: true });
    return envelope?.ok ? parseRefund(envelope.data) : null;
  }

  private async readTransaction(path: string, context: Readonly<Record<string, string>>): Promise<GatewayCharge | null> {
    const { httpStatus, envelope } = await this.call('GET', path, undefined, { allowClientErrors: true });
    if ((httpStatus === 400 || httpStatus === 404) && isNotFound(envelope)) return null;
    const charge = envelope?.ok ? parseTransaction(envelope.data) : null;
    if (!charge) {
      this.logger.warn({ ...context, httpStatus, message: envelope?.message ?? null }, 'Flutterwave verify failed');
      throw new ExternalServiceException('Flutterwave');
    }
    return charge;
  }

  private async call(
    method: 'GET' | 'POST',
    path: string,
    body?: Readonly<Record<string, unknown>>,
    options: { readonly allowClientErrors?: boolean } = {},
  ): Promise<CallResult> {
    if (!this.secretKey) throw new ExternalServiceException('Flutterwave');
    const route = path.split('?')[0]?.replace(/\d+/g, ':id') ?? path;
    let response: Response;
    try {
      const headers = { Authorization: `Bearer ${this.secretKey}`, Accept: 'application/json' };
      const signal = AbortSignal.timeout(TIMEOUT_MS);
      response =
        method === 'POST'
          ? await fetch(`${FLUTTERWAVE_API}${path}`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify(body ?? {}),
              signal,
            })
          : await fetch(`${FLUTTERWAVE_API}${path}`, { method: 'GET', headers, signal });
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown';
      this.logger.warn({ method, route, reason }, 'Flutterwave unreachable');
      throw new ExternalServiceException('Flutterwave');
    }

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    const envelope = parseEnvelope(json);
    const clientError = response.status >= 400 && response.status < 500;
    if (!response.ok && !(clientError && options.allowClientErrors)) {
      this.logger.warn({ method, route, httpStatus: response.status, message: envelope?.message ?? null }, 'Flutterwave returned an error');
      throw new ExternalServiceException('Flutterwave');
    }
    return { httpStatus: response.status, envelope };
  }
}
