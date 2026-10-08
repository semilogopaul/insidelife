'use client';

import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '@/common/api/api-error';
import { Button, TextField } from '@/common/components';
import { useSignIn, useSignUp } from '../hooks/use-auth';

export interface AuthFormProps {
  readonly mode: 'sign-in' | 'sign-up';
}

/** Email + password, one screen. Errors inline, plain language. */
export function AuthForm({ mode }: AuthFormProps) {
  const params = useSearchParams();
  const signIn = useSignIn(params.get('next'));
  const signUp = useSignUp();
  const mutation = mode === 'sign-in' ? signIn : signUp;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    mutation.mutate({ email, password });
  };

  const passwordHint =
    mode === 'sign-up' ? 'At least 8 characters, with a letter and a number.' : undefined;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <TextField
        label="Password"
        type={showPassword ? 'text' : 'password'}
        autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
        required
        minLength={mode === 'sign-up' ? 8 : undefined}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        hint={passwordHint}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="grid size-8 place-items-center rounded-full text-text-soft hover:bg-paper-3"
          >
            {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        }
      />
      {mutation.isError && (
        <p role="alert" className="rounded-card bg-okada-soft px-3.5 py-2.5 text-sm font-bold text-okada">
          {errorMessage(mutation.error)}
        </p>
      )}
      <Button type="submit" size="lg" block loading={mutation.isPending}>
        {mode === 'sign-in' ? 'Sign in' : 'Create account'}
      </Button>
      <p className="text-center text-sm text-text-soft">
        {mode === 'sign-in' ? (
          <>
            New to Lagos?{' '}
            <Link href="/sign-up" className="font-bold text-ink underline underline-offset-4">
              Start your life
            </Link>
          </>
        ) : (
          <>
            Already living here?{' '}
            <Link href="/sign-in" className="font-bold text-ink underline underline-offset-4">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
