import type { ApiErrorBody } from '@insidelife/shared';

/** Every failed request becomes an ApiError with a player-friendly message from the server. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: readonly string[];
  readonly traceId: string | null;

  constructor(status: number, body: Partial<ApiErrorBody> | null) {
    super(body?.message ?? (status === 0 ? 'You’re offline. Check your connection and try again.' : 'Something went wrong. Try again.'));
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.errorCode ?? (status === 0 ? 'NETWORK' : 'UNKNOWN');
    this.details = body?.details ?? [];
    this.traceId = body?.traceId ?? null;
  }

  get isAuth(): boolean {
    return this.status === 401;
  }

  /** Signed in, but the email isn't confirmed yet: send the player to the code screen. */
  get isEmailUnverified(): boolean {
    return this.code === 'EMAIL_UNVERIFIED';
  }
}

/** Message to show for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.details[0] ?? error.message;
  return 'Something went wrong. Try again.';
}
