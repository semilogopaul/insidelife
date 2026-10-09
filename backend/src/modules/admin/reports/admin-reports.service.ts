import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { PLAYER_REPORT_REASON_LABELS, type PlayerReportReason, type PlayerReportStatus } from '@insidelife/shared';
import { toCsv, type CsvColumn } from '../../../common/utils/csv.js';
import { EXPORT_ROW_LIMIT, SqlWhere, containsPattern, offsetOf, pageOf, type Page, type PageRequest } from '../../../common/utils/paging.js';
import { withTransaction } from '../../../database/transaction.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuditActor } from '../../audit/audit.types.js';
import { ReportReviewService, type ReportOutcome } from '../../social/report-review.service.js';
import type { AdminReportRowDto, ReportsQueryDto } from './dto/reports.dto.js';

interface ReportRow {
  readonly id: string;
  readonly reason: PlayerReportReason;
  readonly status: PlayerReportStatus;
  readonly details: string | null;
  readonly same_location: boolean | null;
  readonly message_id: string | null;
  readonly created_at: Date;
  readonly reporter_id: string;
  readonly reporter_user_id: string | null;
  readonly reporter_handle: string | null;
  readonly target_id: string;
  readonly target_user_id: string | null;
  readonly target_handle: string | null;
  readonly target_name: string | null;
  readonly open_against_target: string;
  readonly resolved_at: Date | null;
  readonly resolver_email: string | null;
  readonly resolution_note: string | null;
}

const FROM = `
  FROM social_reports r
  LEFT JOIN characters rc ON rc.id = r.reporter_id
  LEFT JOIN characters tc ON tc.id = r.target_id
  LEFT JOIN users rv ON rv.id = r.resolved_by`;

const COLUMNS = `r.id, r.reason, r.status, r.context->>'details' AS details, (r.context->>'sameLocation')::boolean AS same_location,
                 r.message_id, r.created_at, r.reporter_id, rc.user_id AS reporter_user_id, rc.handle AS reporter_handle,
                 r.target_id, tc.user_id AS target_user_id, tc.handle AS target_handle,
                 tc.first_name || ' ' || tc.last_name AS target_name,
                 (SELECT count(*) FROM social_reports o WHERE o.target_id = r.target_id AND o.status IN ('open', 'reviewing') AND o.id <> r.id) AS open_against_target,
                 r.resolved_at, rv.email AS resolver_email, r.resolution_note`;

const toDto = (row: ReportRow): AdminReportRowDto => ({
  id: row.id,
  reason: row.reason,
  status: row.status,
  details: row.details,
  sameLocation: row.same_location,
  messageId: row.message_id,
  createdAt: row.created_at.toISOString(),
  reporter: { characterId: row.reporter_id, userId: row.reporter_user_id, handle: row.reporter_handle },
  target: { characterId: row.target_id, userId: row.target_user_id, handle: row.target_handle, name: row.target_name },
  openAgainstTarget: Number(row.open_against_target),
  resolvedAt: row.resolved_at?.toISOString() ?? null,
  resolvedBy: row.resolver_email,
  resolutionNote: row.resolution_note,
});

const CSV_COLUMNS: readonly CsvColumn<AdminReportRowDto>[] = [
  { header: 'Id', value: (row) => row.id },
  { header: 'Filed', value: (row) => row.createdAt },
  { header: 'Reason', value: (row) => PLAYER_REPORT_REASON_LABELS[row.reason] ?? row.reason },
  { header: 'Status', value: (row) => row.status },
  { header: 'Reported player', value: (row) => (row.target.handle ? `@${row.target.handle}` : row.target.characterId) },
  { header: 'Reported by', value: (row) => (row.reporter.handle ? `@${row.reporter.handle}` : row.reporter.characterId) },
  { header: 'Details', value: (row) => row.details },
  { header: 'Same place', value: (row) => (row.sameLocation === null ? null : row.sameLocation ? 'yes' : 'no') },
  { header: 'Closed at', value: (row) => row.resolvedAt },
  { header: 'Closed by', value: (row) => row.resolvedBy },
  { header: 'Note', value: (row) => row.resolutionNote },
];

/** Player reports for the admin portal: list, export, and close (actioned or dismissed) with a note, audited. */
@Injectable()
export class AdminReportsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly review: ReportReviewService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ReportsQueryDto, request: PageRequest): Promise<Page<AdminReportRowDto>> {
    const where = this.where(query);
    const order = query.order === 'asc' ? 'ASC' : 'DESC';
    const sort = query.sort === 'resolvedAt' ? 'r.resolved_at' : 'r.created_at';
    const [rows, count] = await Promise.all([
      this.dataSource.query<ReportRow[]>(
        `SELECT ${COLUMNS} ${FROM} ${where.toSql()} ORDER BY ${sort} ${order} NULLS LAST, r.id ${order}
          LIMIT ${request.pageSize} OFFSET ${offsetOf(request)}`,
        where.params,
      ),
      this.dataSource.query<Array<{ total: string }>>(`SELECT count(*) AS total ${FROM} ${where.toSql()}`, where.params),
    ]);
    return pageOf(rows.map(toDto), Number(count[0]?.total ?? 0), request);
  }

  async exportCsv(query: ReportsQueryDto): Promise<{ readonly csv: string; readonly rows: number }> {
    const where = this.where(query);
    const rows = await this.dataSource.query<ReportRow[]>(
      `SELECT ${COLUMNS} ${FROM} ${where.toSql()} ORDER BY r.created_at DESC, r.id LIMIT ${EXPORT_ROW_LIMIT}`,
      where.params,
    );
    return { csv: toCsv(CSV_COLUMNS, rows.map(toDto)), rows: rows.length };
  }

  /** Close a report; the decision and its audit entry commit together. */
  async close(actor: AuditActor, reportId: string, outcome: ReportOutcome, note: string): Promise<AdminReportRowDto> {
    await withTransaction(this.dataSource, async (manager) => {
      const { report, before, after } = await this.review.close(manager, reportId, outcome, note, actor.userId ?? '');
      const target = await manager.query<Array<{ handle: string; user_id: string }>>(`SELECT handle, user_id FROM characters WHERE id = $1`, [report.targetId]);
      await this.audit.record(manager, actor, {
        action: outcome === 'actioned' ? 'report.resolve' : 'report.dismiss',
        target: {
          type: 'report',
          id: report.id,
          label: `${PLAYER_REPORT_REASON_LABELS[report.reason] ?? report.reason} report against ${target[0] ? `@${target[0].handle}` : 'a player'}`,
        },
        before: { ...before },
        after: { ...after },
        reason: note,
        metadata: { targetCharacterId: report.targetId, targetUserId: target[0]?.user_id ?? null, reporterCharacterId: report.reporterId },
      });
    });
    const rows = await this.dataSource.query<ReportRow[]>(`SELECT ${COLUMNS} ${FROM} WHERE r.id = $1`, [reportId]);
    return toDto(rows[0] as ReportRow);
  }

  private where(query: ReportsQueryDto): SqlWhere {
    const status = query.status ?? 'all';
    return new SqlWhere()
      .when(status === 'all' ? undefined : status, (p, value) =>
        value === 'closed' ? `r.status IN ('actioned', 'dismissed')` : value === 'open' ? `r.status IN ('open', 'reviewing')` : `r.status = ${p(value)}`,
      )
      .when(query.reason, (p, reason) => `r.reason = ${p(reason)}`)
      .when(query.q, (p, q) => {
        const like = p(containsPattern(q.replace(/^@/, '')));
        return `rc.handle ILIKE ${like} OR tc.handle ILIKE ${like} OR (tc.first_name || ' ' || tc.last_name) ILIKE ${like}
                OR r.context->>'details' ILIKE ${like} OR r.id::text = ${p(q.trim().toLowerCase())}`;
      })
      .when(query.from, (p, from) => `r.created_at >= ${p(new Date(from))}`)
      .when(query.to, (p, to) => `r.created_at < ${p(new Date(to))}`);
  }
}
