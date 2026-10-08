import { KOBO_PER_NAIRA, findTopupPackage, type PaymentDto } from '@insidelife/shared';
import type { PaymentEntity } from './entities/payment.entity.js';

export function toPaymentDto(payment: PaymentEntity): PaymentDto {
  const pack = payment.purpose === 'topup' ? findTopupPackage(payment.subjectId) : undefined;
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
    topup: pack ? { packageId: pack.id, label: pack.label, virtualAmount: pack.virtualAmount } : null,
  };
}
