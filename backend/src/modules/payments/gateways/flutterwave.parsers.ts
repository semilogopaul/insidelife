import type { GatewayCharge, GatewayChargeStatus, GatewayDetails, GatewayRefund } from './payment-gateway.interface.js';

/**
 * Runtime parsing of Flutterwave v3 JSON (https://developer.flutterwave.com/v3.0/docs). Everything arrives as
 * `unknown` and is narrowed field by field; anything unexpected becomes `null` instead of trusting the payload's shape.
 * Flutterwave amounts are in naira (major units, possibly with kobo decimals); we work in kobo.
 */

type JsonRecord = Readonly<Record<string, unknown>>;

export const isRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
/** Ids come as numbers (`285959875`) or numeric strings; kept as strings. */
const id = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  return typeof value === 'string' && /^\d{1,20}$/.test(value) ? value : null;
};

/** Naira (major units) → kobo, or null for anything that isn't a sane non-negative amount. */
export function nairaToKoboAmount(value: unknown): number | null {
  const naira = num(value);
  if (naira === null || naira < 0) return null;
  const kobo = Math.round(naira * 100);
  return Number.isSafeInteger(kobo) ? kobo : null;
}

/** `{ status: 'success' | 'error', message, data }` — every Flutterwave response. */
export interface FlutterwaveEnvelope {
  readonly ok: boolean;
  readonly message: string;
  readonly data: unknown;
}

export function parseEnvelope(json: unknown): FlutterwaveEnvelope | null {
  if (!isRecord(json) || typeof json.status !== 'string') return null;
  return { ok: json.status === 'success', message: str(json.message) ?? '', data: json.data };
}

/** "No transaction was found for this id" (HTTP 400) — the reference or id is unknown to Flutterwave. */
export const isNotFound = (envelope: FlutterwaveEnvelope | null): boolean => /no transaction (was )?found/i.test(envelope?.message ?? '');

/** `POST /v3/payments` → `data.link` (the hosted checkout). */
export function parseHostedLink(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const link = str(data.link);
  return link && link.startsWith('https://') ? link : null;
}

const STATUS_MAP: Readonly<Record<string, GatewayChargeStatus>> = {
  successful: 'success',
  failed: 'failed',
  cancelled: 'abandoned',
};

/**
 * A transaction (`GET /v3/transactions/:id/verify` or `…/verify_by_reference` data). Keeps only non-sensitive audit
 * fields: no card digits, tokens, IPs or customer contact details.
 */
export function parseTransaction(data: unknown): GatewayCharge | null {
  if (!isRecord(data)) return null;
  const reference = str(data.tx_ref);
  const amountKobo = nairaToKoboAmount(data.amount);
  const rawStatus = str(data.status);
  if (!reference || amountKobo === null || !rawStatus) return null;

  const card = isRecord(data.card) ? data.card : {};
  const createdAt = str(data.created_at);
  const paidAt = createdAt && !Number.isNaN(Date.parse(createdAt)) ? new Date(createdAt) : null;
  const channel = str(data.payment_type);
  const transactionId = id(data.id);
  const details: GatewayDetails = {
    id: transactionId,
    status: rawStatus,
    txRef: reference,
    flwRef: str(data.flw_ref)?.slice(0, 80) ?? null,
    amount: num(data.amount),
    chargedAmount: num(data.charged_amount),
    appFee: num(data.app_fee),
    amountSettled: num(data.amount_settled),
    currency: str(data.currency),
    paymentType: channel,
    processorResponse: str(data.processor_response)?.slice(0, 120) ?? null,
    createdAt,
    cardType: str(card.type),
    cardIssuer: str(card.issuer)?.slice(0, 60) ?? null,
  };
  return {
    reference,
    transactionId,
    status: STATUS_MAP[rawStatus.toLowerCase()] ?? 'pending',
    amountKobo,
    currency: str(data.currency)?.toUpperCase() ?? '',
    channel,
    paidAt,
    details,
  };
}

/** A refund (`POST /v3/transactions/:id/refund` data, `GET /v3/refunds/:id` data, or a refund webhook body). */
export interface ParsedRefund extends GatewayRefund {
  /** The refunded transaction's Flutterwave id. */
  readonly transactionId: string | null;
}

/** Accepts both the API's snake_case (`amount_refunded`, `tx_id`) and the webhook's casing (`AmountRefunded`, `TransactionId`). */
export function parseRefund(data: unknown): ParsedRefund | null {
  if (!isRecord(data)) return null;
  const refundId = id(data.id);
  const amountKobo = nairaToKoboAmount(data.amount_refunded ?? data.AmountRefunded ?? data.amountRefunded);
  const status = str(data.status);
  if (!refundId || amountKobo === null || !status) return null;
  return { refundId, amountKobo, status: status.slice(0, 32), transactionId: id(data.tx_id ?? data.TransactionId ?? data.transactionId) };
}

/** Refund states that mean Flutterwave accepted the refund (money is on its way back, or already there). */
export const isAcceptedRefundStatus = (status: string): boolean => /^(completed|processing|pending)/i.test(status);

export type FlutterwaveWebhook =
  | { readonly kind: 'charge'; readonly transactionId: string; readonly reference: string | null }
  | { readonly kind: 'refund'; readonly refund: ParsedRefund }
  | { readonly kind: 'ignored'; readonly event: string };

/**
 * A webhook body. `charge.completed` → `{ event, data: { id, tx_ref, … } }`; refunds arrive either wrapped
 * (`{ event: 'refund.completed', data }`) or as the bare refund object (`{ id, AmountRefunded, status, TransactionId, … }`).
 * Only ids are taken from it: the charge or refund itself is read back from the API before anything happens.
 */
export function parseWebhook(json: unknown): FlutterwaveWebhook | null {
  if (!isRecord(json)) return null;
  const event = str(json.event) ?? str(json['event.type']);
  if (event === 'charge.completed') {
    const data = isRecord(json.data) ? json.data : null;
    const transactionId = data ? id(data.id) : null;
    if (!data || !transactionId) return null;
    return { kind: 'charge', transactionId, reference: str(data.tx_ref) ?? str(data.txRef) };
  }
  if (event && /refund/i.test(event)) {
    const refund = parseRefund(json.data);
    return refund ? { kind: 'refund', refund } : null;
  }
  if (event) return { kind: 'ignored', event: event.slice(0, 64) };
  const refund = 'AmountRefunded' in json || 'amount_refunded' in json ? parseRefund(json) : null;
  return refund ? { kind: 'refund', refund } : null;
}
