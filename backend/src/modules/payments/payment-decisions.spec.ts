import { INCOME_MULTIPLIER, findTopupPackage, topupVirtualAmount, type PaymentStatus } from '@insidelife/shared';
import {
  CHECK_SCHEDULE_MINUTES,
  claimRefund,
  decideCharge,
  decideRefundReport,
  fulfilmentRetryAt,
  nextCheckAt,
  startOfUtcDay,
  type RefundRecord,
  type RefundReport,
} from './checkout-rules.js';
import type { PaymentRefundStatus } from './entities/payment.entity.js';
import { FLUTTERWAVE_HASH_HEADER, isValidWebhookHash } from './flutterwave-webhook-hash.js';
import {
  isAcceptedRefundStatus,
  isNotFound,
  parseEnvelope,
  parseHostedLink,
  parseRefund,
  parseRefundList,
  parseTransaction,
  parseWebhook,
  refundStateOf,
} from './gateways/flutterwave.parsers.js';
import { isSaneTopupRate, quoteTopup, topupCredit, TOPUP_RATE_MAX, TOPUP_RATE_MIN } from './topup-quote.js';

/**
 * The payment decisions, pinned down branch by branch. Written after mutation testing (`npm run mutation`): each case
 * here kills a change to the code that the other suites let through.
 */

const REF = '7c2b1f0e-6a4d-4c51-9b7e-0d2f3a4b5c6d';

describe('decideCharge', () => {
  const expected = { reference: REF, amountMinor: 250_000, currency: 'NGN', status: 'initialized' as PaymentStatus };
  const charge = { reference: REF, status: 'success' as const, amountMinor: 250_000, chargedAmountMinor: 250_000, currency: 'NGN' };

  it('records why a payment did not go through', () => {
    expect(decideCharge(expected, { ...charge, status: 'failed' })).toEqual({ kind: 'not-paid', status: 'failed', reason: 'charge_failed' });
    expect(decideCharge(expected, { ...charge, status: 'abandoned' })).toEqual({ kind: 'not-paid', status: 'abandoned', reason: 'checkout_abandoned' });
    expect(decideCharge(expected, { ...charge, status: 'pending' })).toEqual({ kind: 'pending' });
  });

  it('accepts exactly the price (and more), never a kobo less', () => {
    expect(decideCharge(expected, charge)).toEqual({ kind: 'record-success' });
    expect(decideCharge(expected, { ...charge, amountMinor: 250_001, chargedAmountMinor: 250_001 })).toEqual({ kind: 'record-success' });
    expect(decideCharge(expected, { ...charge, amountMinor: 249_999 })).toEqual({ kind: 'mismatch', reason: 'amount_mismatch' });
    expect(decideCharge(expected, { ...charge, chargedAmountMinor: 249_999 })).toEqual({ kind: 'mismatch', reason: 'amount_mismatch' });
  });

  it('checks a dollar payment in cents, and never accepts another currency whatever the number', () => {
    const dollars = { ...expected, amountMinor: 1_000, currency: 'USD' };
    const paid = { ...charge, amountMinor: 1_000, chargedAmountMinor: 1_000, currency: 'USD' };
    expect(decideCharge(dollars, paid)).toEqual({ kind: 'record-success' });
    // Card fees passed to the payer make charged_amount larger: still paid.
    expect(decideCharge(dollars, { ...paid, chargedAmountMinor: 1_048 })).toEqual({ kind: 'record-success' });
    expect(decideCharge(dollars, { ...paid, amountMinor: 999 })).toEqual({ kind: 'mismatch', reason: 'amount_mismatch' });
    expect(decideCharge(dollars, { ...paid, chargedAmountMinor: 999 })).toEqual({ kind: 'mismatch', reason: 'amount_mismatch' });
    expect(decideCharge(dollars, { ...paid, chargedAmountMinor: null })).toEqual({ kind: 'mismatch', reason: 'amount_mismatch' });
    // ₦1,000 is not $1,000 and $2,500 is not ₦2,500: a currency mismatch never credits, even when the number is bigger.
    expect(decideCharge(dollars, { ...paid, currency: 'NGN', amountMinor: 1_500_000, chargedAmountMinor: 1_500_000 })).toEqual({ kind: 'mismatch', reason: 'currency_mismatch' });
    expect(decideCharge(expected, { ...charge, currency: 'USD' })).toEqual({ kind: 'mismatch', reason: 'currency_mismatch' });
    expect(decideCharge(dollars, { ...paid, currency: '' })).toEqual({ kind: 'mismatch', reason: 'currency_mismatch' });
    expect(decideCharge({ ...dollars, currency: '' }, { ...paid, currency: '' })).toEqual({ kind: 'mismatch', reason: 'currency_mismatch' });
    expect(decideCharge(dollars, { ...paid, reference: 'someone-else' })).toEqual({ kind: 'mismatch', reason: 'reference_mismatch' });
  });
});

describe('claimRefund', () => {
  it.each<[PaymentStatus, PaymentRefundStatus | null, string]>([
    ['success', null, 'send'],
    ['success', 'due', 'send'],
    ['success', 'failed', 'send'],
    ['success', 'sending', 'in-flight'],
    ['success', 'pending', 'in-flight'],
    ['success', 'refunded', 'already-refunded'],
    ['failed', null, 'not-refundable'],
    ['initialized', 'due', 'not-refundable'],
  ])('payment %s with refund %s → %s', (status, refundStatus, kind) => {
    expect(claimRefund({ status, refundStatus }).kind).toBe(kind);
  });

  it('tells ops why an unpaid payment can’t be refunded', () => {
    expect(claimRefund({ status: 'failed', refundStatus: null })).toEqual({ kind: 'not-refundable', reason: 'The payment never went through, so there is nothing to refund' });
  });
});

const report = (state: RefundReport['state'], refundId = 'r1', amountMinor = 250_000): RefundReport => ({ refundId, amountMinor, state, gatewayStatus: state });
const record = (refundStatus: PaymentRefundStatus | null, refundId: string | null = 'r1'): RefundRecord => ({ refundStatus, refundId, refundGatewayStatus: null });

describe('decideRefundReport (every state × every report)', () => {

  it('completed: final once; the same refund again is ignored; another refund on top is a further partial refund', () => {
    expect(decideRefundReport(record(null, null), report('completed'))).toEqual({ kind: 'completed', additional: false });
    expect(decideRefundReport(record('sending', null), report('completed'))).toEqual({ kind: 'completed', additional: false });
    expect(decideRefundReport(record('pending'), report('completed'))).toEqual({ kind: 'completed', additional: false });
    expect(decideRefundReport(record('failed'), report('completed'))).toEqual({ kind: 'completed', additional: false });
    expect(decideRefundReport(record('refunded'), report('completed'))).toEqual({ kind: 'ignore' });
    expect(decideRefundReport(record('refunded'), report('completed', 'r2'))).toEqual({ kind: 'completed', additional: true });
    expect(decideRefundReport(record('pending', 'r1'), report('completed', 'r2'))).toEqual({ kind: 'completed', additional: false });
  });

  it('pending: recorded until the refund completes; a stale pending never undoes a completed refund', () => {
    expect(decideRefundReport(record(null, null), report('pending'))).toEqual({ kind: 'pending' });
    expect(decideRefundReport(record('sending', null), report('pending'))).toEqual({ kind: 'pending' });
    expect(decideRefundReport(record('pending'), report('pending'))).toEqual({ kind: 'ignore' });
    expect(decideRefundReport(record('refunded'), report('pending'))).toEqual({ kind: 'ignore' });
    expect(decideRefundReport(record('refunded'), report('pending', 'r2'))).toEqual({ kind: 'ignore' });
    expect(decideRefundReport(record('pending', 'r1'), report('pending', 'r2'))).toEqual({ kind: 'pending' });
    expect(decideRefundReport(record('failed'), report('pending'))).toEqual({ kind: 'pending' });
  });

  it('failed: only for the refund we track; reverts a completed one; a repeat is ignored', () => {
    expect(decideRefundReport(record('sending', null), report('failed'))).toEqual({ kind: 'failed', reverted: false });
    expect(decideRefundReport(record('pending'), report('failed'))).toEqual({ kind: 'failed', reverted: false });
    expect(decideRefundReport(record('refunded'), report('failed'))).toEqual({ kind: 'failed', reverted: true });
    expect(decideRefundReport(record('failed'), report('failed'))).toEqual({ kind: 'ignore' });
    // Someone else's refund (a dashboard refund we never tracked) failing changes nothing.
    expect(decideRefundReport(record(null, null), report('failed'))).toEqual({ kind: 'ignore' });
    expect(decideRefundReport(record('refunded', 'r1'), report('failed', 'r2'))).toEqual({ kind: 'ignore' });
    expect(decideRefundReport(record('failed', 'r1'), report('failed', 'r2'))).toEqual({ kind: 'ignore' });
  });
});

describe('reconciler schedule and the UTC day', () => {
  it('checks an unconfirmed checkout on a growing schedule from its start, then stops', () => {
    const created = new Date('2026-10-09T10:00:00.000Z');
    let previous = created.getTime();
    for (const [attempt, minutes] of CHECK_SCHEDULE_MINUTES.entries()) {
      const at = nextCheckAt(created, attempt);
      expect(at?.getTime()).toBe(created.getTime() + minutes * 60_000);
      expect(at!.getTime()).toBeGreaterThan(previous);
      previous = at!.getTime();
    }
    expect(nextCheckAt(created, CHECK_SCHEDULE_MINUTES.length)).toBeNull();
    expect(CHECK_SCHEDULE_MINUTES.at(-1)).toBeLessThan(24 * 60);
  });

  it('backs failed deliveries off: 1, 5, 15, 60 minutes, then every 6 hours', () => {
    const now = new Date('2026-10-09T10:00:00.000Z');
    expect([1, 2, 3, 4, 5, 9].map((attempt) => (fulfilmentRetryAt(now, attempt).getTime() - now.getTime()) / 60_000)).toEqual([1, 5, 15, 60, 360, 360]);
  });

  it('starts the day at 00:00 UTC', () => {
    expect(startOfUtcDay(new Date('2026-10-09T23:59:59.999Z')).toISOString()).toBe('2026-10-09T00:00:00.000Z');
    expect(startOfUtcDay(new Date('2026-10-10T00:00:00.000Z')).toISOString()).toBe('2026-10-10T00:00:00.000Z');
  });
});

describe('top-up quotes at their edges', () => {
  it('refuses unknown packs and packs above the per-payment maximum, with a reason', () => {
    expect(quoteTopup({ packageId: 'free-money' }, { maxNgn: 10_000_000, usd: null })).toEqual({ ok: false, reason: 'That top-up pack doesn’t exist' });
    expect(quoteTopup({ packageId: 'odogwu-pack' }, { maxNgn: 9_999, usd: null })).toEqual({ ok: false, reason: 'One top-up can be at most ₦9,999' });
    expect(quoteTopup({ packageId: 'odogwu-pack' }, { maxNgn: 10_000, usd: null })).toMatchObject({ ok: true, quote: { priceNgn: 10_000, virtualAmount: findTopupPackage('odogwu-pack')?.virtualAmount } });
    expect(quoteTopup({ amountNgn: 10_000_000 }, { maxNgn: 10_000_000, usd: null })).toMatchObject({ ok: true, quote: { virtualAmount: topupVirtualAmount(10_000_000) } });
  });

  it('only trusts whole rates from 1 to 2,000 × the multiplier game naira per ₦1', () => {
    expect([TOPUP_RATE_MIN, TOPUP_RATE_MAX]).toEqual([1, 2_000 * INCOME_MULTIPLIER]);
    expect(isSaneTopupRate(1)).toBe(true);
    expect(isSaneTopupRate(0)).toBe(false);
    expect(isSaneTopupRate(TOPUP_RATE_MAX)).toBe(true);
    expect(isSaneTopupRate(TOPUP_RATE_MAX + 1)).toBe(false);
    expect(isSaneTopupRate(300.5)).toBe(false);
  });

  it('explains why a stored payment can’t be credited', () => {
    expect(topupCredit({ currency: 'NGN', ngnPerUsd: null, subjectId: 'big-boy-pack', amountMinor: 50_000, paidMinor: 50_000, topupRate: null })).toEqual({ ok: false, reason: 'No stored rate for top-up big-boy-pack' });
    expect(topupCredit({ currency: 'NGN', ngnPerUsd: null, subjectId: 'custom', amountMinor: 50_000, paidMinor: 50_000, topupRate: TOPUP_RATE_MAX + 1 })).toEqual({ ok: false, reason: `Stored top-up rate ${TOPUP_RATE_MAX + 1} is out of bounds` });
    // A rate of exactly 1 is sane (and credits 1 game naira per ₦1).
    expect(topupCredit({ currency: 'NGN', ngnPerUsd: null, subjectId: 'custom', amountMinor: 50_000, paidMinor: 50_000, topupRate: 1 })).toMatchObject({ ok: true, credit: { virtualAmount: 500 } });
    // Kobo below a naira are never credited.
    expect(topupCredit({ currency: 'NGN', ngnPerUsd: null, subjectId: 'custom', amountMinor: 50_099, paidMinor: 50_099, topupRate: 300 })).toMatchObject({ ok: true, credit: { virtualAmount: 150_000 } });
  });
});

describe('webhook authenticity', () => {
  const secret = 'a'.repeat(31) + 'b';

  it('reads the verif-hash header and refuses anything else', () => {
    expect(FLUTTERWAVE_HASH_HEADER).toBe('verif-hash');
    expect(isValidWebhookHash(secret, secret)).toBe(true);
    expect(isValidWebhookHash(secret, '')).toBe(false);
    expect(isValidWebhookHash('', secret)).toBe(false);
    expect(isValidWebhookHash(undefined, secret)).toBe(false);
    expect(isValidWebhookHash([secret], secret)).toBe(false);
    // Over 512 characters is refused before comparing, even if it were the secret.
    const long = 'x'.repeat(513);
    expect(isValidWebhookHash(long, long)).toBe(false);
    const max = 'y'.repeat(512);
    expect(isValidWebhookHash(max, max)).toBe(true);
  });
});

describe('Flutterwave parsing, field by field', () => {
  const transaction = { id: 9_231_836, tx_ref: REF, flw_ref: 'FLW-1', amount: 2_500, charged_amount: 2_535, currency: 'ngn', status: 'successful', created_at: '2026-10-09T11:02:03.000Z' };

  it('reads envelopes and the "not found" answer', () => {
    expect(parseEnvelope({ status: 'success', message: 'ok', data: 1 })).toEqual({ ok: true, message: 'ok', data: 1, meta: null });
    expect(parseEnvelope({ status: 'error', data: null })).toEqual({ ok: false, message: '', data: null, meta: null });
    expect(parseEnvelope({ message: 'no status' })).toBeNull();
    expect(parseEnvelope([])).toBeNull();
    expect(parseEnvelope(null)).toBeNull();
    expect(isNotFound({ ok: false, message: 'No transaction was found for this id', data: null, meta: null })).toBe(true);
    expect(isNotFound({ ok: false, message: 'no transaction found', data: null, meta: null })).toBe(true);
    expect(isNotFound({ ok: false, message: 'Invalid authorization key', data: null, meta: null })).toBe(false);
    expect(isNotFound(null)).toBe(false);
  });

  it('only accepts an https hosted-checkout link', () => {
    expect(parseHostedLink({ link: 'https://checkout.flutterwave.com/v3/hosted/pay/abc' })).toBe('https://checkout.flutterwave.com/v3/hosted/pay/abc');
    expect(parseHostedLink({ link: 'http://checkout.flutterwave.com/pay' })).toBeNull();
    expect(parseHostedLink({ link: '' })).toBeNull();
    expect(parseHostedLink('https://x')).toBeNull();
    expect(parseHostedLink(null)).toBeNull();
  });

  it('reads ids as positive whole numbers (numbers or digit strings) only', () => {
    expect(parseTransaction(transaction)?.transactionId).toBe('9231836');
    expect(parseTransaction({ ...transaction, id: '9231836' })?.transactionId).toBe('9231836');
    for (const id of [0, -4, 1.5, '12a', '', ' 12', '1'.repeat(21), Number.MAX_SAFE_INTEGER + 2, null]) {
      expect(parseTransaction({ ...transaction, id })?.transactionId, String(id)).toBeNull();
    }
  });

  it('reads amounts, currency and time carefully', () => {
    const parsed = parseTransaction(transaction)!;
    expect(parsed).toMatchObject({ amountMinor: 250_000, chargedAmountMinor: 253_500, currency: 'NGN', status: 'success' });
    expect(parsed.paidAt?.toISOString()).toBe('2026-10-09T11:02:03.000Z');
    expect(parseTransaction({ ...transaction, amount: 0 })?.amountMinor).toBe(0);
    expect(parseTransaction({ ...transaction, amount: -1 })).toBeNull();
    expect(parseTransaction({ ...transaction, amount: '2500' })).toBeNull();
    expect(parseTransaction({ ...transaction, amount: Number.POSITIVE_INFINITY })).toBeNull();
    expect(parseTransaction({ ...transaction, charged_amount: '2535' })?.chargedAmountMinor).toBeNull();
    expect(parseTransaction({ ...transaction, currency: undefined })?.currency).toBe('');
    expect(parseTransaction({ ...transaction, created_at: 'yesterday' })?.paidAt).toBeNull();
    expect(parseTransaction({ ...transaction, created_at: undefined })?.paidAt).toBeNull();
    expect(parseTransaction({ ...transaction, tx_ref: '' })).toBeNull();
    expect(parseTransaction({ ...transaction, status: '' })).toBeNull();
    expect(parseTransaction('not an object')).toBeNull();
    expect(parseTransaction(null)).toBeNull();
  });

  it('keeps audit details short and never keeps what isn’t there', () => {
    const details = parseTransaction({ ...transaction, flw_ref: 'F'.repeat(100), processor_response: 'P'.repeat(200), card: { issuer: 'I'.repeat(100), type: 'VISA' } })!.details;
    expect(details).toMatchObject({ flwRef: 'F'.repeat(80), processorResponse: 'P'.repeat(120), cardIssuer: 'I'.repeat(60), cardType: 'VISA' });
    expect(parseTransaction({ ...transaction, flw_ref: undefined })!.details).toMatchObject({ flwRef: null, processorResponse: null, cardIssuer: null });
  });

  it('maps every refund status Flutterwave uses', () => {
    expect(refundStateOf('completed')).toBe('completed');
    expect(refundStateOf(' Completed-MPGS ')).toBe('completed');
    for (const status of ['failed', 'declined', 'rejected', 'cancelled', 'canceled', 'reversed', ' FAILED ']) expect(refundStateOf(status), status).toBe('failed');
    for (const status of ['processing', 'pending', 'new', 'not-failed', 'pre-completed']) expect(refundStateOf(status), status).toBe('pending');
    expect(isAcceptedRefundStatus('processing')).toBe(true);
    expect(isAcceptedRefundStatus('completed')).toBe(true);
    expect(isAcceptedRefundStatus('declined')).toBe(false);
  });

  it('reads refunds in either casing and refuses incomplete ones', () => {
    expect(parseRefund({ id: 77, amount_refunded: 2_500, status: 'completed', tx_id: 9_231_836 })).toEqual({ refundId: '77', amountMinor: 250_000, status: 'completed', transactionId: '9231836' });
    expect(parseRefund({ id: '77', AmountRefunded: 1_250, status: 'completed', TransactionId: '9231836' })).toMatchObject({ amountMinor: 125_000, transactionId: '9231836' });
    expect(parseRefund({ id: 77, amountRefunded: 10, status: 'processing', transactionId: 5 })).toMatchObject({ amountMinor: 1_000, transactionId: '5' });
    expect(parseRefund({ amount_refunded: 2_500, status: 'completed' })).toBeNull();
    expect(parseRefund({ id: 77, status: 'completed' })).toBeNull();
    expect(parseRefund({ id: 77, amount_refunded: 2_500 })).toBeNull();
    expect(parseRefund({ id: 77, amount_refunded: 2_500, status: 'x'.repeat(40) })?.status).toHaveLength(32);
    expect(parseRefund('77')).toBeNull();
    expect(parseRefundList([{ id: 1, amount_refunded: 1, status: 'completed' }, { nonsense: true }])).toHaveLength(1);
    expect(parseRefundList({ id: 1 })).toEqual([]);
  });

  it('reads webhooks: charge.completed, refunds (wrapped, bare, either key) and ignores the rest', () => {
    expect(parseWebhook({ event: 'charge.completed', data: { id: 5, tx_ref: REF } })).toEqual({ kind: 'charge', transactionId: '5', reference: REF });
    expect(parseWebhook({ 'event.type': 'charge.completed', data: { id: 5, txRef: REF } })).toEqual({ kind: 'charge', transactionId: '5', reference: REF });
    expect(parseWebhook({ event: 'charge.completed', data: { tx_ref: REF } })).toBeNull();
    expect(parseWebhook({ event: 'refund.completed', data: { id: 9, amount_refunded: 1, status: 'completed', tx_id: 5 } })).toMatchObject({ kind: 'refund' });
    expect(parseWebhook({ id: 9, amount_refunded: 1, status: 'completed', tx_id: 5 })).toMatchObject({ kind: 'refund', refund: { refundId: '9' } });
    expect(parseWebhook({ id: 9, AmountRefunded: 1, status: 'completed', TransactionId: 5 })).toMatchObject({ kind: 'refund' });
    expect(parseWebhook({ id: 9, status: 'completed' })).toBeNull();
    expect(parseWebhook({ event: 'transfer.completed', data: {} })).toEqual({ kind: 'ignored', event: 'transfer.completed' });
    expect(parseWebhook({ event: 'e'.repeat(100) })).toEqual({ kind: 'ignored', event: 'e'.repeat(64) });
    expect(parseWebhook('charge.completed')).toBeNull();
  });
});
