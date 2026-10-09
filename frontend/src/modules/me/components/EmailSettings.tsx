'use client';

import { BadgeCheck } from 'lucide-react';
import { useState } from 'react';
import { EMAIL_CODE_LENGTH } from '@insidelife/shared';
import { ApiError, errorMessage } from '@/common/api/api-error';
import {
  formatCountdown,
  useConfirmEmailCode,
  useEmailVerification,
  useSecondsUntil,
  useSendEmailCode,
} from '@/common/auth/email-verification';
import { useSession } from '@/common/auth/session-store';
import { Badge, Button, CodeField, Spinner, toast } from '@/common/components';

/**
 * Your sign-in email, and (optional unless the server requires it) confirming it with a 6-digit code: send a code,
 * type it in, done. A confirmed email is how we'll reach you about your account.
 */
export function EmailSettings() {
  const user = useSession((state) => state.user);
  const verified = user?.emailVerified ?? false;
  const verification = useEmailVerification(!verified);
  const send = useSendEmailCode();
  const confirm = useConfirmEmailCode(() =>
    toast({ title: 'Email verified', body: 'Thanks. Your account is confirmed.', tone: 'good' }),
  );
  const [code, setCode] = useState('');
  const data = verification.data;
  const resendIn = useSecondsUntil(data?.resendAvailableAt);
  const codeLeft = useSecondsUntil(data?.codeExpiresAt);

  if (!user) return null;

  const header = (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block font-bold">Email</span>
        <span className="block truncate text-sm text-text-soft">{user.email}</span>
      </span>
      {verified ? (
        <Badge tone="good">
          <BadgeCheck size={14} aria-hidden /> Verified
        </Badge>
      ) : (
        <Badge tone="warn">Not verified</Badge>
      )}
    </div>
  );

  if (verified) return header;
  if (!data)
    return (
      <div className="flex flex-col gap-3">
        {header}
        {verification.isPending ? <Spinner className="text-text-soft" /> : null}
      </div>
    );

  const codeLive = data.codeExpiresAt !== null && codeLeft > 0;
  const submit = (value: string): void => {
    if (value.length === EMAIL_CODE_LENGTH && !confirm.isPending) confirm.mutate(value);
  };
  const sendCode = (): void => {
    setCode('');
    confirm.reset();
    send.mutate();
  };

  return (
    <div className="flex flex-col gap-3">
      {header}
      {!data.available ? (
        <p className="text-sm text-text-soft">Email verification isn’t available yet.</p>
      ) : !codeLive ? (
        <>
          <p className="text-sm text-text-soft">
            Confirm it’s really your address, so we can reach you about your account.
          </p>
          <Button variant="ink" onClick={sendCode} loading={send.isPending} disabled={resendIn > 0}>
            {resendIn > 0 ? `Verify your email (in ${formatCountdown(resendIn)})` : 'Verify your email'}
          </Button>
        </>
      ) : (
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit(code);
          }}
        >
          <p className="text-sm text-text-soft">
            We sent a code to your inbox. It works for {formatCountdown(codeLeft)}.
          </p>
          <CodeField
            value={code}
            onChange={(value) => {
              setCode(value);
              if (confirm.isError) confirm.reset();
            }}
            onComplete={submit}
            disabled={confirm.isPending}
            invalid={confirm.error instanceof ApiError && confirm.error.code === 'EMAIL_CODE_INVALID'}
          />
          <Button
            type="submit"
            variant="ink"
            loading={confirm.isPending}
            disabled={code.length !== EMAIL_CODE_LENGTH}
          >
            Confirm
          </Button>
          <p className="text-center text-sm text-text-soft">
            {resendIn > 0 ? (
              <>
                New code in <span className="tabular-nums">{formatCountdown(resendIn)}</span>
              </>
            ) : (
              <button
                type="button"
                onClick={sendCode}
                disabled={send.isPending}
                className="font-bold text-ink underline underline-offset-4"
              >
                Send a new code
              </button>
            )}
          </p>
        </form>
      )}
      {(confirm.isError || send.isError) && (
        <p role="alert" className="rounded-card bg-okada-soft px-3 py-2 text-sm font-bold text-okada">
          {errorMessage(confirm.error ?? send.error)}
        </p>
      )}
      {data.devCode && codeLive && (
        <p className="rounded-card bg-danfo-soft px-3 py-2 text-sm text-ink">
          <strong>Development:</strong> no email server is set up, so here’s the code:{' '}
          <strong className="tabular-nums">{data.devCode}</strong>
        </p>
      )}
    </div>
  );
}
