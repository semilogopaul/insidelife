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
}
