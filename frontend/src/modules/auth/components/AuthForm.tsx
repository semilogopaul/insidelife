'use client';

import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage } from '@/common/api/api-error';
import { useSession } from '@/common/auth/session-store';
import { Button, TextField } from '@/common/components';
import { useSignIn, useSignUp } from '../hooks/use-auth';
import { birthDateError, birthDateFromParts, EMPTY_BIRTH_DATE, type BirthDateParts } from '../lib/birth-date';
import { destinationFor } from '../lib/destination';
import { BirthDateField } from './BirthDateField';

const TERMS_REQUIRED = 'Tick the box to agree to the Terms of Service and Privacy Policy.';

export interface AuthFormProps {
  readonly mode: 'sign-in' | 'sign-up';
}

/** Email + password (+ date of birth to sign up), one screen. Errors inline, plain language. */
export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const signIn = useSignIn(next);
  const signUp = useSignUp();
  const mutation = mode === 'sign-in' ? signIn : signUp;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birth, setBirth] = useState<BirthDateParts>(EMPTY_BIRTH_DATE);
  const [birthError, setBirthError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const status = useSession((state) => state.status);
  const user = useSession((state) => state.user);

  // Already signed in (the 30-day session is still alive): no password needed, carry on.
  useEffect(() => {
    if (status === 'authenticated' && user) router.replace(destinationFor(user, next));
  }, [status, user, next, router]);

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (mode === 'sign-in') {
      signIn.mutate({ email, password });
      return;
    }
    const problem = birthDateError(birth, new Date());
    setBirthError(problem);
    const notAgreed = agreed ? null : TERMS_REQUIRED;
    setTermsError(notAgreed);
    if (!problem && !notAgreed) signUp.mutate({ email, password, birthDate: birthDateFromParts(birth), acceptTerms: true });
  };

  const passwordHint = mode === 'sign-up' ? 'At least 8 characters, with a letter and a number.' : undefined;

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
      {mode === 'sign-up' && (
        <BirthDateField
          value={birth}
          error={birthError}
          onChange={(value) => {
            setBirth(value);
            if (birthError) setBirthError(null);
          }}
        />
      )}
      {mode === 'sign-up' && (
        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => {
                setAgreed(event.target.checked);
                if (event.target.checked) setTermsError(null);
              }}
              aria-invalid={termsError !== null}
              aria-describedby={termsError ? 'terms-error' : undefined}
              className="mt-0.5 size-5 shrink-0 accent-ink"
            />
            <span>
              I agree to the{' '}
              <Link href="/terms" target="_blank" className="font-bold text-ink underline underline-offset-4">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" target="_blank" className="font-bold text-ink underline underline-offset-4">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {termsError && (
            <p id="terms-error" className="text-sm font-bold text-okada">
              {termsError}
            </p>
          )}
        </div>
      )}
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
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link href="/sign-in" className="font-bold text-ink underline underline-offset-4">
              Back to sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
