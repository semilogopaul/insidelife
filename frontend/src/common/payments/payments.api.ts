import type { PaymentDto, PaymentVerificationDto } from '@insidelife/shared';
import { api } from '@/common/api/http';

/** Real-money payments as any feature sees them (Bank lists and buys top-ups; this is the shared read + check). */
export const paymentsApi = {
  /** The account's payments, newest first. */
  list: () => api.get<PaymentDto[]>('/payments'),
  /**
   * Ask the server to confirm a payment with Flutterwave and deliver it if paid (any purpose). Idempotent and safe to
   * repeat: the server asks Flutterwave at most once every few seconds per payment. `transactionId`: Flutterwave's
   * `transaction_id` from the checkout redirect, when there is one (a hint only).
   */
  check: (reference: string, transactionId?: string) =>
    api.post<PaymentVerificationDto>(`/payments/${encodeURIComponent(reference)}/verification`, transactionId ? { transactionId } : {}),
};

/** "I've paid: check now": `POST /payments/:reference/verification`. */
export const checkPayment = (reference: string): Promise<PaymentVerificationDto> => paymentsApi.check(reference);
