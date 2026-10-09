/** The authenticated principal attached to each request by the JWT guard. */
export interface AuthUser {
  readonly userId: string;
  readonly email: string;
  readonly role: 'player' | 'admin';
}

export interface AccessTokenPayload {
  readonly sub: string;
  readonly email: string;
  readonly role: 'player' | 'admin';
  /** Email confirmed when the token was issued. Missing (older tokens) or false: the guard checks the database. */
  readonly ev?: boolean;
  /** Issued at (seconds), set by the signer. */
  readonly iat?: number;
  /** Issued at in milliseconds: compared with the account's cut-off (suspension, deletion) to the millisecond. */
  readonly ia?: number;
}
