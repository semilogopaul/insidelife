'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { LoginRequest, RegisterRequest } from '@insidelife/shared';
import { emailVerificationKey } from '@/common/auth/email-verification';
import { useSession } from '@/common/auth/session-store';
import { destinationFor } from '../lib/destination';
import { authApi } from '../services/auth.api';

export function useSignIn(next: string | null) {
  const router = useRouter();
  const setSession = useSession((state) => state.setSession);
  return useMutation({
    mutationFn: (body: LoginRequest) => authApi.login(body),
    onSuccess: (session) => {
      setSession(session);
      router.replace(destinationFor(session.user, next));
    },
  });
}

/**
 * New accounts go to the character creator, or first to "check your email" (with the code that was just sent) when
 * the server requires a confirmed email.
 */
export function useSignUp() {
  const router = useRouter();
  const client = useQueryClient();
  const setSession = useSession((state) => state.setSession);
  return useMutation({
    mutationFn: (body: RegisterRequest) => authApi.register(body),
    onSuccess: ({ emailVerification, ...session }) => {
      client.setQueryData(emailVerificationKey, emailVerification);
      setSession(session);
      router.replace(destinationFor(session.user, null));
    },
  });
}
