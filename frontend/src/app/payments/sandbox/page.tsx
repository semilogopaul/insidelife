import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SandboxCheckout } from '@/modules/bank';

export const metadata: Metadata = { title: 'Test checkout', robots: { index: false, follow: false } };

/** Development-only fake checkout (the API only links here when it runs the sandbox payment gateway). */
export default function SandboxCheckoutPage() {
  return (
    <Suspense>
      <SandboxCheckout />
    </Suspense>
  );
}
