import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A signed-in admin portal session (after password + authenticator code). The refresh token (httpOnly cookie on the
 * API's domain) rotates on every refresh; presenting a rotated token after a short grace revokes the session. Admin
 * access tokens carry the session id, and the admin guard checks the session on every request, so revoking it signs
 * the admin out at once.
 */
@Entity('admin_sessions')
@Index('admin_sessions_user', ['userId', 'createdAt'])
export class AdminSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** SHA-256 of the current refresh token. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  /** SHA-256 of the token it replaced (accepted for a few seconds: two tabs refreshing at once). */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  previousTokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  rotatedAt: Date | null;

  /** Ends after this much inactivity (extended by each refresh, never past `absoluteExpiresAt`). */
  @Column({ type: 'timestamptz' })
  idleExpiresAt: Date;

  /** Hard end: sign in again with the authenticator after this. */
  @Column({ type: 'timestamptz' })
  absoluteExpiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** `sign-out`, `reuse`, `revoked-by-owner`, `role-removed`, `mfa-reset`. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  revokedReason: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastSeenAt: Date;
}
