import { create } from 'zustand';
import type { AuthSessionDto, AuthUserDto } from '@insidelife/shared';

type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

interface SessionState {
  readonly status: SessionStatus;
  readonly accessToken: string | null;
  readonly expiresAt: number;
  readonly user: AuthUserDto | null;
  /**
   * The last refresh couldn't reach the API (offline, or the server restarting). The session is kept as it was;
   * screens waiting on it say they're retrying instead of sending the player to sign in.
   */
  readonly unreachable: boolean;
  setSession(session: AuthSessionDto): void;
  setUser(user: AuthUserDto): void;
  markUnreachable(): void;
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
  unreachable: false,
  setSession: (session) =>
    set({
      status: 'authenticated',
      accessToken: session.accessToken,
      expiresAt: session.accessTokenExpiresAt,
      user: session.user,
      unreachable: false,
    }),
  setUser: (user) => set({ user }),
  markUnreachable: () => set({ unreachable: true }),
  clear: () => set({ status: 'anonymous', accessToken: null, expiresAt: 0, user: null, unreachable: false }),
}));
