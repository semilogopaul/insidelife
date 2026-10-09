import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { bigintNumber } from '../../../../database/transformers.js';

/**
 * An admin's second factor: an authenticator-app secret (encrypted with ADMIN_MFA_KEY) set up on first sign-in, and
 * one-time recovery codes (keyed hashes). Admin sign-in is refused until it is enabled.
 */
@Entity('admin_mfa')
export class AdminMfaEntity {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  /** Encrypted base32 secret (SecretBox). Null until set up. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  secret: string | null;

  /** Secret shown during set-up, until the first code proves the app has it. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  pendingSecret: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  pendingCreatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  enabledAt: Date | null;

  /** Time step of the last accepted code: that code (and older ones) can't be used again. */
  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  lastUsedStep: number | null;

  /** HMAC-SHA256 of each unused recovery code. */
  @Column({ type: 'jsonb', default: [] })
  recoveryCodeHashes: string[];

  @Column({ type: 'timestamptz', nullable: true })
  recoveryCodesCreatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
