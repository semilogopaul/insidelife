'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { EMAIL_CODE_LENGTH } from '@insidelife/shared';
import { ApiError, errorMessage } from '@/common/api/api-error';
import { refreshSession } from '@/common/api/http';
import {
  formatCountdown,
  useConfirmEmailCode,
  useEmailVerification,
  useSecondsUntil,
  useSendEmailCode,
} from '@/common/auth/email-verification';
import { useSession } from '@/common/auth/session-store';
import { useSignOut } from '@/common/auth/use-sign-out';
import { Button, CodeField, Spinner } from '@/common/components';
import { destinationFor } from '../lib/destination';

/**
 * "Check your email": enter the 6-digit code to start playing (when the server requires a confirmed email). Resend
 * with a countdown, and two ways back out: a different email (sign up again) or the sign-in page.
 */
export function VerifyEmail() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const status = useSession((state) => state.status);
  const user = useSession((state) => state.user);
  const unreachable = useSession((state) => state.unreachable);
  const verification = useEmailVerification();
  const send = useSendEmailCode();
  const confirm = useConfirmEmailCode((session) => router.replace(destinationFor(session.user, next)));
  const differentEmail = useSignOut('/sign-up');
  const backToSignIn = useSignOut('/sign-in');
  const [code, setCode] = useState('');
  const autoSent = useRef(false);
  const errorId = useId();

  const data = verification.data;
  const resendIn = useSecondsUntil(data?.resendAvailableAt);
  const codeLeft = useSecondsUntil(data?.codeExpiresAt);
  const sendCode = send.mutate;

  useEffect(() => {
    if (status === 'anonymous') router.replace('/sign-in?next=/verify-email');
    // Verified (or verification not required): nothing to do here.
    if (status === 'authenticated' && user && (user.emailVerified || !user.mustVerifyEmail))
      router.replace(destinationFor(user, next));
  }, [status, user, next, router]);

  // Confirmed in another tab: pick up the new session (the focus refetch said so) and move on.
  const confirmedElsewhere = data?.verified === true && user?.emailVerified === false;
  useEffect(() => {
    if (confirmedElsewhere) void refreshSession();
  }, [confirmedElsewhere]);

  // No live code (signed in again later, or the first email failed): send one, once.
  useEffect(() => {
    if (!data || data.verified || !data.available || data.codeExpiresAt !== null || autoSent.current) return;
    if (data.resendAvailableAt > Date.now()) return;
    autoSent.current = true;
    sendCode();
  }, [data, sendCode]);

  if (status !== 'authenticated' || !user || !data) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-16 text-text-soft">
        <Spinner size={26} />
        {unreachable ? 'Can’t reach Lagos right now. Retrying…' : 'Loading…'}
      </div>
    );
  }

  const submit = (value: string): void => {
    if (value.length === EMAIL_CODE_LENGTH && !confirm.isPending) confirm.mutate(value);
  };
  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    submit(code);
  };
  const expired = data.codeExpiresAt !== null && codeLeft === 0;
  const noCode = data.codeExpiresAt === null || expired;
  const confirmError = confirm.isError ? confirm.error : null;
  const devCode = data.devCode;

  return (
    <>
      <h1 className="type-title text-4xl">Check your email</h1>
      <p className="mb-8 mt-2 text-text-soft">
        We sent a {EMAIL_CODE_LENGTH}-digit code to{' '}
        <strong className="break-all text-text">{data.email}</strong>. Enter it to start your life.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <CodeField
          value={code}
          onChange={(value) => {
            setCode(value);
            if (confirm.isError) confirm.reset();
          }}
          onComplete={submit}
          disabled={confirm.isPending}
          invalid={confirmError instanceof ApiError && confirmError.code === 'EMAIL_CODE_INVALID'}
          describedBy={confirmError ? errorId : undefined}
          autoFocus
        />
        {confirmError && (
          <p
            id={errorId}
            role="alert"
            className="rounded-card bg-okada-soft px-3.5 py-2.5 text-sm font-bold text-okada"
          >
            {errorMessage(confirmError)}
          </p>
        )}
        {!confirmError && noCode && !send.isPending && (
          <p role="status" className="rounded-card bg-paper-2 px-3.5 py-2.5 text-sm text-text-soft">
            {expired ? 'That code has expired. Ask for a new one below.' : 'No code yet. Ask for one below.'}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          block
          loading={confirm.isPending}
          disabled={code.length !== EMAIL_CODE_LENGTH}
        >
          Confirm email
        </Button>
      </form>

      <div className="mt-5 flex flex-col items-center gap-2 text-center text-sm text-text-soft">
        <p>
          Didn’t get it? Check spam, or{' '}
          {resendIn > 0 ? (
            <span>
              ask again in <span className="tabular-nums">{formatCountdown(resendIn)}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setCode('');
                confirm.reset();
                sendCode();
              }}
              disabled={send.isPending || !data.available}
              className="font-bold text-ink underline underline-offset-4 disabled:opacity-50"
            >
              send a new code
            </button>
          )}
        </p>
        {send.isError && (
          <p role="alert" className="font-bold text-okada">
            {errorMessage(send.error)}
          </p>
        )}
        {send.isSuccess && !send.isPending && <p role="status">New code sent.</p>}
        {devCode && (
          <p className="w-full rounded-card bg-danfo-soft px-3.5 py-2.5 text-left text-ink">
            <strong>Development:</strong> no email server is set up, so here’s the code:{' '}
            <strong className="tabular-nums">{devCode}</strong>
          </p>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-2 border-t border-line pt-6">
        <Button
          variant="paper"
          block
          onClick={() => differentEmail.mutate()}
          loading={differentEmail.isPending}
        >
          Use a different email
        </Button>
        <Button
          variant="ghost"
          block
          onClick={() => backToSignIn.mutate()}
          loading={backToSignIn.isPending}
          className="text-ink hover:bg-paper-2"
        >
          Back to sign in
        </Button>
      </div>
    </>
  );
}
