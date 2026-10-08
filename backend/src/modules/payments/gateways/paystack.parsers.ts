import type { GatewayCharge, GatewayChargeStatus, GatewayDetails } from './payment-gateway.interface.js';

/**
 * Runtime parsing of Paystack JSON (https://paystack.com/docs/api/transaction/). Everything arrives as `unknown`
 * and is narrowed field by field; anything unexpected becomes `null` instead of trusting the payload's shape.
 */

type JsonRecord = Readonly<Record<string, unknown>>;

export const isRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const int = (value: unknown): number | null => (typeof value === 'number' && Number.isSafeInteger(value) ? value : null);

/** `{ status: boolean, message: string, data?: … }` — every Paystack response. */
export interface PaystackEnvelope {
  readonly status: boolean;
  readonly message: string;
  readonly data: unknown;
}

export function parseEnvelope(json: unknown): PaystackEnvelope | null {
  if (!isRecord(json) || typeof json.status !== 'boolean') return null;
  return { status: json.status, message: str(json.message) ?? '', data: json.data };
}

/** `POST /transaction/initialize` → `data.authorization_url`, `data.reference`. */
export function parseInitializeData(data: unknown): { readonly authorizationUrl: string; readonly reference: string } | null {
  if (!isRecord(data)) return null;
  const authorizationUrl = str(data.authorization_url);
  const reference = str(data.reference);
  if (!authorizationUrl || !reference || !authorizationUrl.startsWith('https://')) return null;
  return { authorizationUrl, reference };
}

const STATUS_MAP: Readonly<Record<string, GatewayChargeStatus>> = {
  success: 'success',
  failed: 'failed',
  abandoned: 'abandoned',
  reversed: 'reversed',
};

/**
 * A transaction object (`GET /transaction/verify/:reference` data, or a `charge.success` webhook's data).
 * Keeps only non-sensitive audit fields: no authorization code, BIN, last4, card signature, IP or customer contact.
 */
export function parseTransaction(data: unknown): GatewayCharge | null {
  if (!isRecord(data)) return null;
  const reference = str(data.reference);
  const amountKobo = int(data.amount);
  const rawStatus = str(data.status);
  if (!reference || amountKobo === null || !rawStatus) return null;

  const authorization = isRecord(data.authorization) ? data.authorization : {};
  const paidAtRaw = str(data.paid_at) ?? str(data.paidAt);
  const paidAt = paidAtRaw && !Number.isNaN(Date.parse(paidAtRaw)) ? new Date(paidAtRaw) : null;
  const channel = str(data.channel);
  const details: GatewayDetails = {
    id: int(data.id),
    status: rawStatus,
    reference,
    amount: amountKobo,
    currency: str(data.currency),
    channel,
    gatewayResponse: str(data.gateway_response)?.slice(0, 120) ?? null,
    paidAt: paidAtRaw,
    fees: int(data.fees),
    cardType: str(authorization.card_type),
    bank: str(authorization.bank),
  };
  return {
    reference,
    status: STATUS_MAP[rawStatus] ?? 'pending',
    amountKobo,
    currency: str(data.currency) ?? '',
    channel,
    paidAt,
    details,
  };
}

/** A webhook body: `{ event: 'charge.success', data: {...} }`. */
export function parseWebhookEvent(json: unknown): { readonly event: string; readonly data: unknown } | null {
  if (!isRecord(json)) return null;
  const event = str(json.event);
  return event ? { event, data: json.data } : null;
}
