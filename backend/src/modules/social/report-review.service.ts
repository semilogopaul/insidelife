import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { PlayerReportStatus } from '@insidelife/shared';
import { ConflictException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { ReportEntity } from './entities/report.entity.js';

/** How a moderator closes a report: something was done about it, or there was nothing to act on. */
export type ReportOutcome = Extract<PlayerReportStatus, 'actioned' | 'dismissed'>;

export interface ReportReviewState {
  readonly status: PlayerReportStatus;
  readonly resolvedAt: Date | null;
  readonly resolvedBy: string | null;
  readonly resolutionNote: string | null;
}

export interface ReportReview {
  readonly report: ReportEntity;
  readonly before: ReportReviewState;
  readonly after: ReportReviewState;
}

const OPEN_STATUSES: ReadonlySet<PlayerReportStatus> = new Set(['open', 'reviewing']);

const stateOf = (report: ReportEntity): ReportReviewState => ({
  status: report.status,
  resolvedAt: report.resolvedAt,
  resolvedBy: report.resolvedBy,
  resolutionNote: report.resolutionNote,
});

/**
 * Moderators closing player reports (the admin portal). Runs in the caller's transaction so the decision and its
 * audit entry commit together. The reported player is never told who reported them.
 */
@Injectable()
export class ReportReviewService {
  async close(manager: EntityManager, reportId: string, outcome: ReportOutcome, note: string, adminUserId: string): Promise<ReportReview> {
    const report = await manager.findOne(ReportEntity, { where: { id: reportId }, lock: { mode: 'pessimistic_write' } });
    if (!report) throw new ResourceNotFoundException('Report');
    if (!OPEN_STATUSES.has(report.status)) throw new ConflictException('REPORT_CLOSED', 'This report was already closed');
    const before = stateOf(report);
    report.status = outcome;
    report.resolvedAt = new Date();
    report.resolvedBy = adminUserId;
    report.resolutionNote = note.trim().slice(0, 1000);
    await manager.save(report);
    return { report, before, after: stateOf(report) };
  }
}
