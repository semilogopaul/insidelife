import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { toCsv, type CsvColumn } from '../../common/utils/csv.js';
import { EXPORT_ROW_LIMIT, SqlWhere, containsPattern, offsetOf, pageOf, type Page, type PageRequest } from '../../common/utils/paging.js';
import { auditChanges, auditMetadata } from './audit-diff.js';
import type { AuditActor, AuditEntryDto, AuditEntryInput, AuditQuery } from './audit.types.js';

interface AuditRow {
  readonly id: string;
  readonly occurred_at: Date;
  readonly actor_user_id: string | null;
  readonly actor_email: string | null;
  readonly actor_role: AuditEntryDto['actor']['role'];
  readonly action: string;
  readonly target_type: AuditEntryDto['target']['type'];
  readonly target_id: string | null;
  readonly target_label: string | null;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
  readonly reason: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly ip: string | null;
  readonly user_agent: string | null;
  readonly trace_id: string | null;
}

const COLUMNS = `id, occurred_at, actor_user_id, actor_email, actor_role, action, target_type, target_id, target_label,
                 before, after, reason, metadata, ip, user_agent, trace_id`;

const toDto = (row: AuditRow): AuditEntryDto => ({
  id: row.id,
  occurredAt: row.occurred_at.toISOString(),
  actor: { userId: row.actor_user_id, email: row.actor_email, role: row.actor_role },
  action: row.action,
  target: { type: row.target_type, id: row.target_id, label: row.target_label },
  before: row.before,
  after: row.after,
  reason: row.reason,
  metadata: row.metadata ?? {},
  ip: row.ip,
  userAgent: row.user_agent,
  traceId: row.trace_id,
});

const CSV_COLUMNS: readonly CsvColumn<AuditEntryDto>[] = [
  { header: 'When (UTC)', value: (row) => row.occurredAt },
  { header: 'Actor email', value: (row) => row.actor.email },
  { header: 'Actor id', value: (row) => row.actor.userId },
  { header: 'Actor role', value: (row) => row.actor.role },
  { header: 'Action', value: (row) => row.action },
  { header: 'Target type', value: (row) => row.target.type },
  { header: 'Target id', value: (row) => row.target.id },
  { header: 'Target', value: (row) => row.target.label },
  { header: 'Before', value: (row) => row.before },
  { header: 'After', value: (row) => row.after },
  { header: 'Reason', value: (row) => row.reason },
  { header: 'Details', value: (row) => (Object.keys(row.metadata).length > 0 ? row.metadata : null) },
  { header: 'IP', value: (row) => row.ip },
  { header: 'User agent', value: (row) => row.userAgent },
  { header: 'Trace id', value: (row) => row.traceId },
];

const jsonOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : JSON.stringify(value));

/** Postgres setting that lets the purge job scrub a purged player's identity from the append-only table. */
const MAINTENANCE_SETTING = 'insidelife.audit_maintenance';

/**
 * The audit log: `record` appends inside the caller's transaction (pass the same `EntityManager` that makes the
 * change), and the admin portal lists, filters and exports it.
 */
@Injectable()
export class AuditService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Append one entry using `manager` (the transaction of the change it describes). Returns the entry id. */
  async record(manager: EntityManager, actor: AuditActor, entry: AuditEntryInput): Promise<string> {
    const { before, after } = auditChanges(entry.before, entry.after);
    const rows = await manager.query<Array<{ id: string }>>(
      `INSERT INTO audit_logs (actor_user_id, actor_email, actor_role, action, target_type, target_id, target_label,
                               before, after, reason, metadata, ip, user_agent, trace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11::jsonb, $12, $13, $14)
       RETURNING id`,
      [
        actor.userId,
        actor.email,
        actor.role,
        entry.action,
        entry.target.type,
        entry.target.id?.slice(0, 64) ?? null,
        entry.target.label?.slice(0, 200) ?? null,
        jsonOrNull(before),
        jsonOrNull(after),
        entry.reason?.trim().slice(0, 1000) || null,
        JSON.stringify(auditMetadata(entry.metadata)),
        actor.ip,
        actor.userAgent,
        actor.traceId,
      ],
    );
    return rows[0]?.id ?? '';
  }

  /** For events that change nothing else (sign-ins, exports): its own short transaction. */
  recordNow(actor: AuditActor, entry: AuditEntryInput): Promise<string> {
    return this.record(this.dataSource.manager, actor, entry);
  }

  async list(query: AuditQuery, request: PageRequest): Promise<Page<AuditEntryDto>> {
    const where = this.where(query);
    const order = query.order === 'asc' ? 'ASC' : 'DESC';
    const [rows, count] = await Promise.all([
      this.dataSource.query<AuditRow[]>(
        `SELECT ${COLUMNS} FROM audit_logs ${where.toSql()}
          ORDER BY occurred_at ${order}, id ${order}
          LIMIT ${request.pageSize} OFFSET ${offsetOf(request)}`,
        where.params,
      ),
      this.dataSource.query<Array<{ total: string }>>(`SELECT count(*) AS total FROM audit_logs ${where.toSql()}`, where.params),
    ]);
    return pageOf(rows.map(toDto), Number(count[0]?.total ?? 0), request);
  }

  /** CSV of the matching entries (newest first, at most EXPORT_ROW_LIMIT). */
  async exportCsv(query: AuditQuery): Promise<{ readonly csv: string; readonly rows: number }> {
    const where = this.where(query);
    const rows = await this.dataSource.query<AuditRow[]>(
      `SELECT ${COLUMNS} FROM audit_logs ${where.toSql()} ORDER BY occurred_at DESC, id DESC LIMIT ${EXPORT_ROW_LIMIT}`,
      where.params,
    );
    return { csv: toCsv(CSV_COLUMNS, rows.map(toDto)), rows: rows.length };
  }

  /**
   * After an account is purged, replace the player's identity in past entries (as actor or target) with a neutral
   * label. Ids, actions, times and the admins' identities stay: the record of who did what is kept.
   */
  async scrubPlayer(manager: EntityManager, userId: string, label: string): Promise<void> {
    await manager.query(`SELECT set_config('${MAINTENANCE_SETTING}', 'on', true)`);
    await manager.query(
      `UPDATE audit_logs
          SET target_label = $2,
              before = CASE WHEN before IS NULL THEN NULL ELSE before - 'email' - 'handle' - 'firstName' - 'lastName' - 'name' END,
              after = CASE WHEN after IS NULL THEN NULL ELSE after - 'email' - 'handle' - 'firstName' - 'lastName' - 'name' END
        WHERE target_type = 'player' AND target_id = $1`,
      [userId, label],
    );
    await manager.query(`UPDATE audit_logs SET actor_email = NULL, ip = NULL, user_agent = NULL WHERE actor_user_id = $1 AND actor_role = 'player'`, [userId]);
    await manager.query(`SELECT set_config('${MAINTENANCE_SETTING}', 'off', true)`);
  }

  private where(query: AuditQuery): SqlWhere {
    return new SqlWhere()
      .when(query.q, (p, q) => {
        const like = p(containsPattern(q));
        return `actor_email ILIKE ${like} OR target_label ILIKE ${like} OR target_id ILIKE ${like} OR action ILIKE ${like}
                OR reason ILIKE ${like} OR trace_id = ${p(q.trim())}`;
      })
      .when(query.actorUserId, (p, id) => `actor_user_id = ${p(id)}`)
      .when(query.actor, (p, actor) => `actor_email ILIKE ${p(containsPattern(actor))}`)
      .when(query.action, (p, action) => (action.endsWith('.') ? `action LIKE ${p(`${action.replace(/[\\%_]/g, '\\$&')}%`)}` : `action = ${p(action)}`))
      .when(query.targetType, (p, type) => `target_type = ${p(type)}`)
      .when(query.targetId, (p, id) => `target_id = ${p(id)}`)
      .when(query.from, (p, from) => `occurred_at >= ${p(new Date(from))}`)
      .when(query.to, (p, to) => `occurred_at < ${p(new Date(to))}`);
  }
}
