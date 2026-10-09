import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import {
  findAdSlot,
  findClubPlayProduct,
  type ModerationCampaignDto,
  type ModerationClubOrderDto,
  type ModerationQueueDto,
  type PromotionStatus,
} from '@insidelife/shared';
import { toCsv, type CsvColumn } from '../../../common/utils/csv.js';
import { EXPORT_ROW_LIMIT, SqlWhere, containsPattern, offsetOf, pageOf, type Page, type PageRequest } from '../../../common/utils/paging.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuditAction, AuditActor } from '../../audit/audit.types.js';
import { ModerationService } from '../../promotions/moderation.service.js';
import type { ModerationDecision } from '../../promotions/rules/status.rules.js';
import type { AdminPromotionRowDto } from '../interfaces/admin-moderation.interfaces.js';
import type { PromotionHistoryQueryDto, PromotionSort } from './dto/moderation.dto.js';

interface PromotionRow {
  readonly type: 'campaign' | 'club-order';
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly artist: string | null;
  readonly owner_user_id: string;
  readonly owner_email: string | null;
  readonly owner_handle: string | null;
  readonly status: PromotionStatus;
  readonly amount_kobo: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly days: number;
  readonly payment_reference: string | null;
  readonly paid_at: Date | null;
  readonly reviewed_at: Date | null;
  readonly reviewer_email: string | null;
  readonly rejection_reason: string | null;
  readonly created_at: Date;
  readonly media_url: string | null;
  readonly link_url: string | null;
}

const SORTS: Readonly<Record<PromotionSort, string>> = {
  createdAt: 'p.created_at',
  startDate: 'p.start_date',
  amount: 'p.amount_kobo',
  paidAt: 'p.paid_at',
  reviewedAt: 'p.reviewed_at',
};

const FROM = `
  FROM (
    SELECT 'campaign' AS type, pc.id, pc.title, pc.slot_id AS detail, NULL::varchar AS artist, pc.owner_user_id, pc.owner_character_id,
           pc.status, pc.amount_kobo, pc.start_date, pc.end_date, pc.days, pc.payment_reference, pc.paid_at, pc.reviewed_at,
           pc.reviewed_by, pc.rejection_reason, pc.created_at, pc.creative_url AS media_url, pc.link_url
      FROM promotion_campaigns pc
    UNION ALL
    SELECT 'club-order', o.id, t.title, o.product_id, t.artist_name, o.owner_user_id, o.owner_character_id,
           o.status, o.amount_kobo, o.start_date, o.end_date, o.days, o.payment_reference, o.paid_at, o.reviewed_at,
           o.reviewed_by, o.rejection_reason, o.created_at, t.audio_url, NULL
      FROM promotion_club_orders o JOIN promotion_tracks t ON t.id = o.track_id
  ) p
  LEFT JOIN characters oc ON oc.id = p.owner_character_id
  LEFT JOIN users ou ON ou.id = p.owner_user_id
  LEFT JOIN users rv ON rv.id = p.reviewed_by`;

const COLUMNS = `p.type, p.id, p.title, p.detail, p.artist, p.owner_user_id, ou.email AS owner_email, oc.handle AS owner_handle,
                 p.status, p.amount_kobo, p.start_date::text AS start_date, p.end_date::text AS end_date, p.days, p.payment_reference,
                 p.paid_at, p.reviewed_at, rv.email AS reviewer_email, p.rejection_reason, p.created_at, p.media_url, p.link_url`;

const toDto = (row: PromotionRow): AdminPromotionRowDto => ({
  type: row.type,
  id: row.id,
  title: row.title,
  subtitle:
    row.type === 'campaign'
      ? (findAdSlot(row.detail)?.name ?? row.detail)
      : `${row.artist ?? 'Unknown artist'} · ${findClubPlayProduct(row.detail)?.name ?? row.detail}`,
  status: row.status,
  amountKobo: Number(row.amount_kobo),
  startDate: row.start_date,
  endDate: row.end_date,
  days: row.days,
  paymentReference: row.payment_reference,
  paidAt: row.paid_at?.toISOString() ?? null,
  reviewedAt: row.reviewed_at?.toISOString() ?? null,
  reviewedBy: row.reviewer_email,
  rejectionReason: row.rejection_reason,
  createdAt: row.created_at.toISOString(),
  owner: { userId: row.owner_user_id, email: row.owner_email, handle: row.owner_handle },
  mediaUrl: row.media_url,
  mediaType: row.type === 'campaign' ? 'image' : 'audio',
  linkUrl: row.link_url,
});

const CSV_COLUMNS: readonly CsvColumn<AdminPromotionRowDto>[] = [
  { header: 'Type', value: (row) => row.type },
  { header: 'Id', value: (row) => row.id },
  { header: 'Title', value: (row) => row.title },
  { header: 'Placement / artist', value: (row) => row.subtitle },
  { header: 'Status', value: (row) => row.status },
  { header: 'Amount (NGN)', value: (row) => row.amountKobo / 100 },
  { header: 'Start', value: (row) => row.startDate },
  { header: 'End (exclusive)', value: (row) => row.endDate },
  { header: 'Days', value: (row) => row.days },
  { header: 'Owner email', value: (row) => row.owner.email },
  { header: 'Owner handle', value: (row) => (row.owner.handle ? `@${row.owner.handle}` : null) },
  { header: 'Payment reference', value: (row) => row.paymentReference },
  { header: 'Paid at', value: (row) => row.paidAt },
  { header: 'Reviewed at', value: (row) => row.reviewedAt },
  { header: 'Reviewed by', value: (row) => row.reviewedBy },
  { header: 'Rejection reason', value: (row) => row.rejectionReason },
  { header: 'Created', value: (row) => row.createdAt },
];

type Verb = 'approve' | 'reject' | 'mark-refunded';

/**
 * Moderation of paid ads and club orders for the admin portal: the queue and decisions go through the promotions
 * module's `ModerationService` (state machine, notifications, media clean-up), with the audit entry written inside its
 * transaction; the history is a read model over both tables.
 */
@Injectable()
export class AdminModerationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly moderation: ModerationService,
    private readonly audit: AuditService,
  ) {}

  queue(): Promise<ModerationQueueDto> {
    return this.moderation.queue();
  }

  decideCampaign(actor: AuditActor, id: string, verb: Verb, reason: string | null, refund?: boolean): Promise<ModerationCampaignDto> {
    return this.moderation.decideCampaign(actor.userId ?? '', id, this.decision(verb, refund), reason, async (manager, change) => {
      const campaign = change.entity;
      await this.audit.record(manager, actor, {
        action: `campaign.${verb}` as AuditAction,
        target: { type: 'campaign', id: campaign.id, label: await this.label(manager, `“${campaign.title}”`, campaign.ownerCharacterId) },
        before: { status: change.fromStatus },
        after: { status: change.toStatus, ...(verb === 'reject' ? { rejectionReason: reason, refund } : {}) },
        reason,
        metadata: {
          ownerUserId: campaign.ownerUserId,
          slotId: campaign.slotId,
          amountKobo: campaign.amountKobo,
          paymentReference: campaign.paymentReference,
        },
      });
    });
  }

  decideClubOrder(actor: AuditActor, id: string, verb: Verb, reason: string | null, refund?: boolean): Promise<ModerationClubOrderDto> {
    return this.moderation.decideClubOrder(actor.userId ?? '', id, this.decision(verb, refund), reason, async (manager, change) => {
      const { order, track } = change.entity;
      await this.audit.record(manager, actor, {
        action: `club-order.${verb}` as AuditAction,
        target: { type: 'club-order', id: order.id, label: await this.label(manager, `“${track.title}” by ${track.artistName}`, order.ownerCharacterId) },
        before: { status: change.fromStatus },
        after: { status: change.toStatus, ...(verb === 'reject' ? { rejectionReason: reason, refund } : {}) },
        reason,
        metadata: {
          ownerUserId: order.ownerUserId,
          trackId: track.id,
          productId: order.productId,
          amountKobo: order.amountKobo,
          paymentReference: order.paymentReference,
        },
      });
    });
  }

  async history(query: PromotionHistoryQueryDto, request: PageRequest): Promise<Page<AdminPromotionRowDto>> {
    const where = this.where(query);
    const order = query.order === 'asc' ? 'ASC' : 'DESC';
    const [rows, count] = await Promise.all([
      this.dataSource.query<PromotionRow[]>(
        `SELECT ${COLUMNS} ${FROM} ${where.toSql()}
          ORDER BY ${SORTS[query.sort ?? 'createdAt']} ${order} NULLS LAST, p.id ${order}
          LIMIT ${request.pageSize} OFFSET ${offsetOf(request)}`,
        where.params,
      ),
      this.dataSource.query<Array<{ total: string }>>(`SELECT count(*) AS total ${FROM} ${where.toSql()}`, where.params),
    ]);
    return pageOf(rows.map(toDto), Number(count[0]?.total ?? 0), request);
  }

  async exportCsv(query: PromotionHistoryQueryDto): Promise<{ readonly csv: string; readonly rows: number }> {
    const where = this.where(query);
    const rows = await this.dataSource.query<PromotionRow[]>(
      `SELECT ${COLUMNS} ${FROM} ${where.toSql()} ORDER BY ${SORTS[query.sort ?? 'createdAt']} DESC NULLS LAST, p.id LIMIT ${EXPORT_ROW_LIMIT}`,
      where.params,
    );
    return { csv: toCsv(CSV_COLUMNS, rows.map(toDto)), rows: rows.length };
  }

  private where(query: PromotionHistoryQueryDto): SqlWhere {
    return new SqlWhere()
      .when(query.type === 'all' ? undefined : query.type, (p, type) => `p.type = ${p(type)}`)
      .when(query.status, (p, status) => `p.status = ${p(status)}`)
      .when(query.q, (p, q) => {
        const like = p(containsPattern(q.replace(/^@/, '')));
        return `p.title ILIKE ${like} OR p.artist ILIKE ${like} OR oc.handle ILIKE ${like} OR ou.email ILIKE ${like}
                OR p.payment_reference ILIKE ${like} OR p.id::text = ${p(q.trim().toLowerCase())}`;
      })
      // Drafts and abandoned checkouts aren't moderation history unless asked for by status.
      .when(query.status ? undefined : 'paid', () => `p.paid_at IS NOT NULL OR p.status NOT IN ('draft', 'pending-payment', 'cancelled')`)
      .when(query.from, (p, from) => `p.created_at >= ${p(new Date(from))}`)
      .when(query.to, (p, to) => `p.created_at < ${p(new Date(to))}`);
  }

  /** `refund` undefined = the policy: refund what hasn't started running, never what has. */
  private decision(verb: Verb, refund?: boolean): ModerationDecision {
    if (verb === 'approve') return { action: 'approve' };
    if (verb === 'reject') return { action: 'reject', refund };
    return { action: 'mark-refunded' };
  }

  /** `“Title” by @owner` for the audit log. */
  private async label(manager: EntityManager, what: string, ownerCharacterId: string | null): Promise<string> {
    if (!ownerCharacterId) return what;
    const rows = await manager.query<Array<{ handle: string }>>(`SELECT handle FROM characters WHERE id = $1`, [ownerCharacterId]);
    return rows[0] ? `${what} (@${rows[0].handle})` : what;
  }
}
