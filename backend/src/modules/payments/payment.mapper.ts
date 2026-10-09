import { KOBO_PER_NAIRA, type PaymentDto } from '@insidelife/shared';
import type { PaymentEntity } from './entities/payment.entity.js';
import { topupCredit } from './topup-quote.js';

export function toPaymentDto(payment: PaymentEntity): PaymentDto {
  const credit = payment.purpose === 'topup' ? topupCredit(payment) : null;
  return {
    reference: payment.reference,
    purpose: payment.purpose,
    subjectId: payment.subjectId,
    description: payment.description,
    amountNgn: payment.amountKobo / KOBO_PER_NAIRA,
    amountKobo: payment.amountKobo,
    status: payment.status,
    fulfilled: payment.fulfilledAt !== null,
    channel: payment.channel,
    createdAt: payment.createdAt.toISOString(),
    verifiedAt: payment.verifiedAt?.toISOString() ?? null,
    refundedNgn: payment.refundStatus === 'refunded' ? payment.refundedKobo / KOBO_PER_NAIRA : 0,
    topup: credit?.ok ? credit.credit : null,
  };
}
