import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { PlayerReportReason, PlayerReportStatus } from '@insidelife/shared';
import { bigintNumber } from '../../../database/transformers.js';

/** Server-captured context for moderators (never shown to the reported player). */
export interface ReportContext {
  readonly details: string | null;
  readonly reporterLocationId: string;
  readonly targetLocationId: string;
  readonly sameLocation: boolean;
}

@Entity('social_reports')
@Index('social_reports_target_status', ['targetId', 'status'])
@Index('social_reports_reporter_created', ['reporterId', 'createdAt'])
export class ReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  reporterId: string;

  @Column({ type: 'uuid' })
  targetId: string;

  @Column({ type: 'varchar', length: 24 })
  reason: PlayerReportReason;

  @Column({ type: 'jsonb' })
  context: ReportContext;

  /** Reported chat message, if any. */
  @Column({ type: 'uuid', nullable: true })
  messageId: string | null;

  @Column({ type: 'varchar', length: 12, default: 'open' })
  status: PlayerReportStatus;

  @Column({ type: 'bigint', transformer: bigintNumber })
  gameMinute: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /** When a moderator closed it (actioned or dismissed). */
  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string | null;

  /** Moderator's note (admins only). */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  resolutionNote: string | null;
}
