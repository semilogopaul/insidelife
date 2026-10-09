'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import type { AuthSessionDto, EmailVerificationDto } from '@insidelife/shared';
import { api } from '@/common/api/http';
import { useSession } from './session-store';

/**
 * Email verification, shared by the sign-up code screen (auth) and Me → Settings (me): where the check stands, send a
 * code, confirm it. Confirming answers with a fresh session that carries the confirmed email.
 */
export const emailVerificationKey = ['auth', 'email-verification'] as const;

export const emailVerificationApi = {
  status: () => api.get<EmailVerificationDto>('/auth/email-verification'),
  send: () => api.post<EmailVerificationDto>('/auth/email-verification'),
  confirm: (code: string) => api.post<AuthSessionDto>('/auth/email-verification/confirm', { code }),
};

/** Where the email check stands. Refetched on focus, so confirming in another tab moves this one on too. */
export function useEmailVerification(enabled = true) {
  const client = useQueryClient();
  const authenticated = useSession((state) => state.status === 'authenticated');
  return useQuery({
    queryKey: emailVerificationKey,
    queryFn: async () => {
      const fresh = await emailVerificationApi.status();
      // Development only: the server keeps codes hashed and can't repeat one, so keep the devCode we were given.
      const previous = client.getQueryData<EmailVerificationDto>(emailVerificationKey);
      return previous?.devCode && fresh.codeExpiresAt !== null
        ? { ...fresh, devCode: previous.devCode }
        : fresh;
    },
    enabled: authenticated && enabled,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
}

export function useSendEmailCode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: emailVerificationApi.send,
    onSuccess: (status) => client.setQueryData(emailVerificationKey, status),
    // Refused (too soon) or failed: learn the real "resend from" time.
    onError: () => void client.invalidateQueries({ queryKey: emailVerificationKey }),
  });
}

/** Confirm a code. On success the session (and its user) now says the email is confirmed. */
export function useConfirmEmailCode(onConfirmed?: (session: AuthSessionDto) => void) {
  const client = useQueryClient();
  const setSession = useSession((state) => state.setSession);
  return useMutation({
    mutationFn: emailVerificationApi.confirm,
    onSuccess: (session) => {
      setSession(session);
      client.setQueryData<EmailVerificationDto>(emailVerificationKey, (current) =>
        current ? { ...current, verified: true, codeExpiresAt: null, devCode: undefined } : current,
      );
      onConfirmed?.(session);
    },
    // An expired or burnt code: refresh the status so the screen offers a new one.
    onError: () => void client.invalidateQueries({ queryKey: emailVerificationKey }),
  });
}

function subscribeEverySecond(listener: () => void): () => void {
  const id = window.setInterval(listener, 1_000);
  return () => window.clearInterval(id);
}

/** Whole seconds until `targetMs` (0 once reached or when there's no target), updated every second. */
export function useSecondsUntil(targetMs: number | null | undefined): number {
  return useSyncExternalStore(
    subscribeEverySecond,
    () => (targetMs ? Math.max(0, Math.ceil((targetMs - Date.now()) / 1000)) : 0),
    () => 0,
  );
}

/** 75 → "1:15". */
export function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
