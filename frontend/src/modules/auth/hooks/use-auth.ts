'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { AuthSessionDto, LoginRequest, RegisterRequest } from '@insidelife/shared';
import { useSession } from '@/common/auth/session-store';
import { authApi } from '../services/auth.api';

/** Same-site path only (never `//evil.com` or an absolute URL). */
const isSafePath = (path: string | null): path is string => path !== null && path.startsWith('/') && !path.startsWith('//');

/**
 * Where to go once signed in: back to `next` when it's safe, else the game (or the creator without a character).
 * Pages outside the game (moderation, payment callbacks) don't need a character.
 */
export function destinationFor(session: AuthSessionDto, next: string | null): string {
  const home = session.user.hasCharacter ? '/play' : '/create';
  if (!isSafePath(next)) return home;
  const needsCharacter = next === '/play' || next.startsWith('/play/') || next.startsWith('/play?');
  return needsCharacter && !session.user.hasCharacter ? '/create' : next;
}

export function useSignIn(next: string | null) {
  const router = useRouter();
  const setSession = useSession((state) => state.setSession);
  return useMutation({
    mutationFn: (body: LoginRequest) => authApi.login(body),
    onSuccess: (session) => {
      setSession(session);
      router.replace(destinationFor(session, next));
    },
  });
}

export function useSignUp() {
  const router = useRouter();
  const setSession = useSession((state) => state.setSession);
  return useMutation({
    mutationFn: (body: RegisterRequest) => authApi.register(body),
    onSuccess: (session) => {
      setSession(session);
      router.replace('/create');
    },
  });
}
