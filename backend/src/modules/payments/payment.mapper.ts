import { KOBO_PER_NAIRA, type PaymentDto } from '@insidelife/shared';
import type { PaymentEntity } from './entities/payment.entity.js';
import { topupCredit } from './topup-quote.js';

/** Naira value (kobo) of an amount in the payment's currency: itself for NGN, cents × the stored rate for USD. */
const koboValue = (payment: PaymentEntity, minor: number): number => (payment.currency === 'USD' && payment.ngnPerUsd !== null ? minor * payment.ngnPerUsd : minor);

export function toPaymentDto(payment: PaymentEntity): PaymentDto {
  const credit = payment.purpose === 'topup' ? topupCredit(payment) : null;
  const refundedMinor = payment.refundStatus === 'refunded' ? payment.refundedMinor : 0;
  return {
    reference: payment.reference,
    purpose: payment.purpose,
    subjectId: payment.subjectId,
    description: payment.description,
    currency: payment.currency,
    amountMinor: payment.amountMinor,
    ngnPerUsd: payment.ngnPerUsd,
    amountNgn: payment.amountKobo / KOBO_PER_NAIRA,
    amountKobo: payment.amountKobo,
    status: payment.status,
    fulfilled: payment.fulfilledAt !== null,
    channel: payment.channel,
    createdAt: payment.createdAt.toISOString(),
    verifiedAt: payment.verifiedAt?.toISOString() ?? null,
    refundedMinor,
    refundedNgn: koboValue(payment, refundedMinor) / KOBO_PER_NAIRA,
    topup: credit?.ok ? credit.credit : null,
  };
}
