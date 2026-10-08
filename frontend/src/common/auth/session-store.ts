import { create } from 'zustand';
import type { AuthSessionDto, AuthUserDto } from '@insidelife/shared';

type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

interface SessionState {
  readonly status: SessionStatus;
  readonly accessToken: string | null;
  readonly expiresAt: number;
  readonly user: AuthUserDto | null;
  setSession(session: AuthSessionDto): void;
  setUser(user: AuthUserDto): void;
  clear(): void;
}

/**
 * Auth state. The access token lives only in memory (never localStorage — XSS can't lift it across reloads);
 * the refresh token is an httpOnly cookie the browser sends to /api/v1/auth/refresh.
 */
export const useSession = create<SessionState>()((set) => ({
  status: 'unknown',
  accessToken: null,
  expiresAt: 0,
  user: null,
  setSession: (session) =>
    set({ status: 'authenticated', accessToken: session.accessToken, expiresAt: session.accessTokenExpiresAt, user: session.user }),
  setUser: (user) => set({ user }),
  clear: () => set({ status: 'anonymous', accessToken: null, expiresAt: 0, user: null }),
}));
