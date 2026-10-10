import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import type { PaymentCurrency, PaymentPurpose, PaymentStatus } from '@insidelife/shared';
import { toCsv, type CsvColumn } from '../../../common/utils/csv.js';
import { EXPORT_ROW_LIMIT, SqlWhere, containsPattern, offsetOf, pageOf, type PageRequest } from '../../../common/utils/paging.js';
import type { AdminPaymentRowDto, AdminPaymentsPageDto, PaymentsQueryDto } from './dto/payments.dto.js';

interface PaymentRow {
  readonly id: string;
  readonly reference: string;
  readonly purpose: PaymentPurpose;
  readonly subject_id: string;
  readonly description: string;
  readonly amount_kobo: string;
  readonly currency: PaymentCurrency;
  readonly amount_minor: string;
  readonly ngn_per_usd: number | null;
  readonly status: PaymentStatus;
  readonly provider: string;
  readonly channel: string | null;
  readonly failure_reason: string | null;
  readonly created_at: Date;
  readonly verified_at: Date | null;
  readonly fulfilled_at: Date | null;
  readonly user_id: string;
  readonly email: string | null;
  readonly character_id: string | null;
  readonly handle: string | null;
  readonly order_status: string | null;
}

const FROM = `
  FROM payments pm
  LEFT JOIN users u ON u.id = pm.user_id
  LEFT JOIN characters c ON c.id = pm.character_id
  LEFT JOIN promotion_campaigns pc ON pm.purpose = 'billboard' AND pc.id::text = pm.subject_id
  LEFT JOIN promotion_club_orders po ON pm.purpose = 'club-play' AND po.id::text = pm.subject_id`;

const COLUMNS = `pm.id, pm.reference, pm.purpose, pm.subject_id, pm.description, pm.amount_kobo, pm.currency, pm.amount_minor, pm.ngn_per_usd, pm.status, pm.provider, pm.channel,
                 pm.failure_reason, pm.created_at, pm.verified_at, pm.fulfilled_at, pm.user_id, u.email, pm.character_id, c.handle,
                 COALESCE(pc.status, po.status) AS order_status`;

const toDto = (row: PaymentRow): AdminPaymentRowDto => ({
  id: row.id,
  reference: row.reference,
  purpose: row.purpose,
  subjectId: row.subject_id,
  description: row.description,
  amountKobo: Number(row.amount_kobo),
  currency: row.currency,
  amountMinor: Number(row.amount_minor),
  ngnPerUsd: row.ngn_per_usd,
  status: row.status,
  provider: row.provider,
  channel: row.channel,
  failureReason: row.failure_reason,
  createdAt: row.created_at.toISOString(),
  verifiedAt: row.verified_at?.toISOString() ?? null,
  fulfilledAt: row.fulfilled_at?.toISOString() ?? null,
  user: { id: row.user_id, email: row.email },
  character: row.character_id && row.handle ? { id: row.character_id, handle: row.handle } : null,
  refund: row.order_status === 'refund-due' || row.order_status === 'refunded' ? row.order_status : null,
});

const CSV_COLUMNS: readonly CsvColumn<AdminPaymentRowDto>[] = [
  { header: 'Reference', value: (row) => row.reference },
  { header: 'Started', value: (row) => row.createdAt },
  { header: 'Purpose', value: (row) => row.purpose },
  { header: 'Description', value: (row) => row.description },
  { header: 'Currency', value: (row) => row.currency },
  { header: 'Charged', value: (row) => row.amountMinor / 100 },
  { header: 'NGN per USD', value: (row) => row.ngnPerUsd },
  { header: 'Amount (NGN value)', value: (row) => row.amountKobo / 100 },
  { header: 'Status', value: (row) => row.status },
  { header: 'Refund', value: (row) => row.refund },
  { header: 'Provider', value: (row) => row.provider },
  { header: 'Channel', value: (row) => row.channel },
  { header: 'Confirmed', value: (row) => row.verifiedAt },
  { header: 'Delivered', value: (row) => row.fulfilledAt },
  { header: 'Failure', value: (row) => row.failureReason },
  { header: 'Email', value: (row) => row.user.email },
  { header: 'Handle', value: (row) => (row.character ? `@${row.character.handle}` : null) },
  { header: 'User id', value: (row) => row.user.id },
];

/** Real-money payments (top-ups, ad and club orders) for the admin portal: read-only list and export. */
@Injectable()
export class AdminPaymentsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(query: PaymentsQueryDto, request: PageRequest): Promise<AdminPaymentsPageDto> {
    const where = this.where(query);
    const order = query.order === 'asc' ? 'ASC' : 'DESC';
    const sort = query.sort === 'amount' ? 'pm.amount_kobo' : query.sort === 'verifiedAt' ? 'pm.verified_at' : 'pm.created_at';
    const [rows, count] = await Promise.all([
      this.dataSource.query<PaymentRow[]>(
        `SELECT ${COLUMNS} ${FROM} ${where.toSql()} ORDER BY ${sort} ${order} NULLS LAST, pm.id ${order}
          LIMIT ${request.pageSize} OFFSET ${offsetOf(request)}`,
        where.params,
      ),
      this.dataSource.query<Array<{ total: string; amount: string }>>(
        `SELECT count(*) AS total, COALESCE(sum(pm.amount_kobo) FILTER (WHERE pm.status = 'success'), 0) AS amount ${FROM} ${where.toSql()}`,
        where.params,
      ),
    ]);
    return { ...pageOf(rows.map(toDto), Number(count[0]?.total ?? 0), request), successKobo: Number(count[0]?.amount ?? 0) };
  }

  async exportCsv(query: PaymentsQueryDto): Promise<{ readonly csv: string; readonly rows: number }> {
    const where = this.where(query);
    const rows = await this.dataSource.query<PaymentRow[]>(
      `SELECT ${COLUMNS} ${FROM} ${where.toSql()} ORDER BY pm.created_at DESC, pm.id LIMIT ${EXPORT_ROW_LIMIT}`,
      where.params,
    );
    return { csv: toCsv(CSV_COLUMNS, rows.map(toDto)), rows: rows.length };
  }

  private where(query: PaymentsQueryDto): SqlWhere {
    return new SqlWhere()
      .when(query.status, (p, status) => `pm.status = ${p(status)}`)
      .when(query.purpose, (p, purpose) => `pm.purpose = ${p(purpose)}`)
      .when(query.refund, (p, refund) =>
        refund === 'any' ? `COALESCE(pc.status, po.status) IN ('refund-due', 'refunded')` : `COALESCE(pc.status, po.status) = ${p(refund)}`,
      )
      .when(query.q, (p, q) => {
        const like = p(containsPattern(q.replace(/^@/, '')));
        return `pm.reference ILIKE ${like} OR u.email ILIKE ${like} OR c.handle ILIKE ${like} OR pm.description ILIKE ${like}`;
      })
      .when(query.from, (p, from) => `pm.created_at >= ${p(new Date(from))}`)
      .when(query.to, (p, to) => `pm.created_at < ${p(new Date(to))}`);
  }
}
