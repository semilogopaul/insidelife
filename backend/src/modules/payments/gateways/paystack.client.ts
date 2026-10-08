import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExternalServiceException } from '../../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../../config/configuration.js';
import type { GatewayCharge, GatewayInitializeInput, PaymentGateway } from './payment-gateway.interface.js';
import { parseEnvelope, parseInitializeData, parseTransaction, type PaystackEnvelope } from './paystack.parsers.js';

const PAYSTACK_API = 'https://api.paystack.co';
const TIMEOUT_MS = 10_000;

/**
 * Thin Paystack Transactions API client (initialize + verify). Server-side only: the secret key never leaves this
 * class and is never logged; failures surface as `ExternalServiceException` (502) with no gateway internals.
 */
@Injectable()
export class PaystackClient implements PaymentGateway {
  readonly provider = 'paystack' as const;
  private readonly logger = new Logger(PaystackClient.name);
  private readonly secretKey: string;
  private readonly callbackUrl: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const paystack = config.get('paystack', { infer: true });
    this.secretKey = paystack.secretKey;
    this.callbackUrl = paystack.callbackUrl;
  }

  async initialize(input: GatewayInitializeInput): Promise<{ readonly authorizationUrl: string }> {
    const { envelope } = await this.call('POST', '/transaction/initialize', {
      email: input.email,
      amount: input.amountKobo,
      currency: 'NGN',
      reference: input.reference,
      callback_url: this.callbackUrl,
      metadata: { ...input.metadata, description: input.description },
    });
    const data = envelope ? parseInitializeData(envelope.data) : null;
    if (!envelope?.status || !data || data.reference !== input.reference) {
      this.logger.warn({ reference: input.reference, message: envelope?.message ?? null }, 'Paystack initialize rejected');
      throw new ExternalServiceException('Paystack');
    }
    return { authorizationUrl: data.authorizationUrl };
  }

  async verify(reference: string): Promise<GatewayCharge | null> {
    const { httpStatus, envelope } = await this.call('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    if (httpStatus === 404) return null;
    const charge = envelope?.status ? parseTransaction(envelope.data) : null;
    if (!charge) {
      this.logger.warn({ reference, httpStatus, message: envelope?.message ?? null }, 'Paystack verify failed');
      throw new ExternalServiceException('Paystack');
    }
    return charge;
  }

  private async call(
    method: 'GET' | 'POST',
    path: string,
    body?: Readonly<Record<string, unknown>>,
  ): Promise<{ readonly httpStatus: number; readonly envelope: PaystackEnvelope | null }> {
    if (!this.secretKey) throw new ExternalServiceException('Paystack');
    let response: Response;
    try {
      const headers = { Authorization: `Bearer ${this.secretKey}`, Accept: 'application/json' };
      const signal = AbortSignal.timeout(TIMEOUT_MS);
      response =
        method === 'POST'
          ? await fetch(`${PAYSTACK_API}${path}`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify(body ?? {}),
              signal,
            })
          : await fetch(`${PAYSTACK_API}${path}`, { method: 'GET', headers, signal });
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown';
      this.logger.warn({ method, path: path.split('/').slice(0, 3).join('/'), reason }, 'Paystack unreachable');
      throw new ExternalServiceException('Paystack');
    }

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    const envelope = parseEnvelope(json);
    if (!response.ok && response.status !== 404) {
      this.logger.warn({ method, httpStatus: response.status, message: envelope?.message ?? null }, 'Paystack returned an error');
      throw new ExternalServiceException('Paystack');
    }
    return { httpStatus: response.status, envelope };
  }
}
