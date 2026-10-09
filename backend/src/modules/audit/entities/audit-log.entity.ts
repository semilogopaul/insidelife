import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { AuditActorRole, AuditTargetType } from '../audit.types.js';

/** JSON values captured before/after a change (only the fields that changed). */
export type AuditSnapshot = Readonly<Record<string, unknown>>;

/**
 * Who did what, to whom, where and when: one row per admin mutation (and security-relevant player actions such as
 * deleting an account). Written in the same transaction as the change it describes, so a change without its audit row
 * (or the reverse) can't exist. Append-only: a database trigger refuses UPDATE and DELETE (see the migration), except
 * for the account purge job, which scrubs a purged player's identity.
 */
@Entity('audit_logs')
@Index('audit_logs_occurred', ['occurredAt', 'id'])
@Index('audit_logs_actor_occurred', ['actorUserId', 'occurredAt'])
@Index('audit_logs_target_occurred', ['targetType', 'targetId', 'occurredAt'])
@Index('audit_logs_action_occurred', ['action', 'occurredAt'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Wall-clock time of the write (clock_timestamp, so entries in one transaction still order correctly). */
  @Column({ type: 'timestamptz', default: () => 'clock_timestamp()' })
  occurredAt: Date;

  /** Null for system actions (scheduled jobs). */
  @Column({ type: 'uuid', nullable: true })
  actorUserId: string | null;

  /** Email at the time of the action (kept even if the account changes later). */
  @Column({ type: 'varchar', length: 254, nullable: true })
  actorEmail: string | null;

  @Column({ type: 'varchar', length: 16 })
  actorRole: AuditActorRole;

  /** Dotted verb, e.g. `player.suspend`, `campaign.approve`, `wallet.adjust`. */
  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 32 })
  targetType: AuditTargetType;

  @Column({ type: 'varchar', length: 64, nullable: true })
  targetId: string | null;

  /** Human label at the time, e.g. `@tolu_b (Tolu Bakare)`. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  targetLabel: string | null;

  /** Values of the changed fields before the change. */
  @Column({ type: 'jsonb', nullable: true })
  before: AuditSnapshot | null;

  /** Values of the changed fields after the change. */
  @Column({ type: 'jsonb', nullable: true })
  after: AuditSnapshot | null;

  /** Why (required for admin mutations that affect a player). */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  reason: string | null;

  /** Extra facts that aren't a field change (ledger transaction id, export filters, row counts…). */
  @Column({ type: 'jsonb', default: {} })
  metadata: AuditSnapshot;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  /** The request's trace id (also in the API logs and error responses). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  traceId: string | null;
}
