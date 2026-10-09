import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PaymentCallback } from '@/modules/bank';

export const metadata: Metadata = { title: 'Payment', robots: { index: false, follow: false } };

/** Flutterwave redirects here after checkout with `?status=…&tx_ref=…&transaction_id=…` (the dev sandbox with `?reference=…`). */
export default function PaymentCallbackPage() {
  return (
    <Suspense>
      <PaymentCallback />
    </Suspense>
  );
}
