import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmail } from '@/modules/auth';

export const metadata: Metadata = { title: 'Check your email' };

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
