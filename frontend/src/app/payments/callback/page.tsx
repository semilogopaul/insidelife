import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PaymentCallback } from '@/modules/bank';

export const metadata: Metadata = { title: 'Payment', robots: { index: false, follow: false } };

/** Paystack (and the dev sandbox) redirect here with `?reference=…` after checkout. */
export default function PaymentCallbackPage() {
  return (
    <Suspense>
      <PaymentCallback />
    </Suspense>
  );
}
