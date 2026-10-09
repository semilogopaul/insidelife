import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm, AuthSwitch } from '@/modules/auth';

export const metadata: Metadata = { title: 'Start your life' };

export default function SignUpPage() {
  return (
    <>
      <AuthSwitch mode="sign-up" />
      <h1 className="type-title text-4xl">Start your life</h1>
      <p className="mb-8 mt-2 text-text-soft">One account, one life. Fate picks your family; the rest is up to you.</p>
      <Suspense>
        <AuthForm mode="sign-up" />
      </Suspense>
    </>
  );
}
