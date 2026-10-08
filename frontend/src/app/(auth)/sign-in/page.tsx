import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '@/modules/auth';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <>
      <h1 className="type-title text-4xl">Welcome back</h1>
      <p className="mb-8 mt-2 text-text-soft">Lagos kept moving while you were away. Sign in to see what happened.</p>
      <Suspense>
        <AuthForm mode="sign-in" />
      </Suspense>
    </>
  );
}
