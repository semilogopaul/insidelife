import type { WelcomeReaction } from '@insidelife/shared';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type UserRole = 'player' | 'admin';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Always stored lower-cased and trimmed. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  /** Real date of birth (`YYYY-MM-DD`), checked against the minimum age at sign-up. Private: never sent to other players. */
  @Column({ type: 'date', nullable: true })
  birthDate: string | null;

  /** When the player ticked "I agree to the Terms of Service and Privacy Policy" at sign-up (null: older accounts). */
  @Column({ type: 'timestamptz', nullable: true })
  termsAcceptedAt: Date | null;

  /** Which version of the terms (TERMS_VERSION) they agreed to. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  termsVersion: string | null;

  @Column({ type: 'varchar', length: 16, default: 'player' })
  role: UserRole;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  /** Set while an admin has suspended the account: no sign-in, no play. */
  @Column({ type: 'timestamptz', nullable: true })
  suspendedAt: Date | null;

  /** Moderator's note for the suspension (admins only; never shown to other players). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  suspensionReason: string | null;

  @Column({ type: 'uuid', nullable: true })
  suspendedBy: string | null;

  /**
   * Soft delete: the player (or an admin) deleted the account. Sign-in is refused, the character is hidden, the email
   * and handle stay reserved, and ledger and payment records are kept. Restorable until `purgeAfter`.
   */
  @Index('users_deleted_at', { where: '"deleted_at" IS NOT NULL' })
  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  /** Admin who deleted it; null when the player deleted their own account. */
  @Column({ type: 'uuid', nullable: true })
  deletedBy: string | null;

  /** When the purge job anonymises the account (end of the restore window). */
  @Column({ type: 'timestamptz', nullable: true })
  purgeAfter: Date | null;

  /** Personal data removed (email, password, birth date, names, handle). Can't be restored after this. */
  @Column({ type: 'timestamptz', nullable: true })
  purgedAt: Date | null;

  /** When the new-player welcome note was answered (existing accounts were marked seen when it launched). */
  @Column({ type: 'timestamptz', nullable: true })
  welcomeSeenAt: Date | null;

  /** Which button they pressed on the welcome note: `i-dey-for-you` or `na-you-sabi`. */
  @Column({ type: 'varchar', length: 24, nullable: true })
  welcomeReaction: WelcomeReaction | null;

  /** When the "featured places are live" prompt was dismissed (it shows once per account). */
  @Column({ type: 'timestamptz', nullable: true })
  featuredSeenAt: Date | null;

  /** When the guided walkthrough ended (existing accounts were marked completed when it launched). */
  @Column({ type: 'timestamptz', nullable: true })
  tourCompletedAt: Date | null;

  /** Whether the walkthrough ended by skipping it rather than finishing. */
  @Column({ type: 'boolean', default: false })
  tourSkipped: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
