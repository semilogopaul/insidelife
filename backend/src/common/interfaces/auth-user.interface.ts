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
}
