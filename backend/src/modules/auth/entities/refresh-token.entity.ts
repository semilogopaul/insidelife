import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Rotating refresh tokens. Each refresh replaces the token within the same `familyId`; presenting a token that was
 * already rotated means it leaked, so the whole family is revoked (OWASP refresh-token reuse detection).
 */
@Entity('refresh_tokens')
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid' })
  familyId: string;

  /** SHA-256 of the opaque token; the raw token only ever lives in the httpOnly cookie. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  replacedById: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
