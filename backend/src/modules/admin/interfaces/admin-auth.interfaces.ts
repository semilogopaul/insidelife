/** `owner`: an address in ADMIN_EMAILS (can manage other admins). `admin`: granted the role from the portal. */
export type AdminRole = 'owner' | 'admin';

/** The signed-in admin, attached to admin API requests by `AdminAuthGuard`. */
export interface AdminPrincipal {
  readonly userId: string;
  readonly email: string;
  readonly role: AdminRole;
  readonly sessionId: string;
}

/** Claims of an admin access token (signed with an admin-only key and audience). */
export interface AdminAccessPayload {
  readonly sub: string;
  readonly email: string;
  /** Admin session id (`admin_sessions.id`). */
  readonly sid: string;
  readonly scope: 'admin';
  /** Authentication methods: password and one-time code. */
  readonly amr: readonly string[];
  readonly iat?: number;
}

/** Claims of the short-lived token between the password step and the authenticator step. */
export interface AdminChallengePayload {
  readonly sub: string;
  readonly scope: 'admin-mfa';
  readonly stage: 'setup' | 'verify';
}

// ----- Responses -------------------------------------------------------------------------------------------------

export interface AdminMeDto {
  readonly id: string;
  readonly email: string;
  readonly role: AdminRole;
  readonly mfaEnabledAt: string | null;
  readonly recoveryCodesLeft: number;
  readonly sessionId: string;
  /** ISO time the session ends regardless of activity. */
  readonly sessionExpiresAt: string;
}

/** Access token in the body; the refresh token is only ever an httpOnly cookie on the API's domain. */
export interface AdminSessionDto {
  readonly accessToken: string;
  /** Unix ms. */
  readonly accessTokenExpiresAt: number;
  readonly admin: AdminMeDto;
}

/** After the password: set up an authenticator (first sign-in) or enter its code. */
export interface AdminChallengeDto {
  readonly stage: 'setup' | 'verify';
  readonly challengeToken: string;
  /** Unix ms. */
  readonly expiresAt: number;
  /** Only for `setup`: what the authenticator app needs (QR code of `otpauthUrl`, or type the secret). */
  readonly setup: {
    readonly issuer: string;
    readonly accountName: string;
    readonly secret: string;
    readonly otpauthUrl: string;
  } | null;
}

/** Set-up finished: a session, and the recovery codes (shown once). */
export interface AdminSetupCompleteDto extends AdminSessionDto {
  readonly recoveryCodes: readonly string[];
}

export interface AdminRecoveryCodesDto {
  readonly recoveryCodes: readonly string[];
}
