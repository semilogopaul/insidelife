import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { PresenceService } from '../../presence/presence.service.js';

export interface RevenueDayDto {
  /** `YYYY-MM-DD` (Africa/Lagos). */
  readonly date: string;
  readonly topupKobo: number;
  readonly billboardKobo: number;
  readonly clubPlayKobo: number;
  readonly totalKobo: number;
  readonly payments: number;
}

export interface AdminDashboardDto {
  readonly generatedAt: string;
  readonly players: {
    readonly total: number;
    readonly new24h: number;
    readonly new7d: number;
    readonly new30d: number;
    readonly online: number;
    readonly activeToday: number;
    readonly suspended: number;
    readonly deletedPendingPurge: number;
    readonly withCharacter: number;
  };
  readonly revenue: {
    readonly days: readonly RevenueDayDto[];
    readonly last30dKobo: number;
    readonly last7dKobo: number;
    readonly todayKobo: number;
  };
  readonly moderation: {
    readonly campaignsInReview: number;
    readonly clubOrdersInReview: number;
    readonly refundsDue: number;
    readonly openReports: number;
  };
}

const DAYS = 30;
const LAGOS = 'Africa/Lagos';

/** One screen of numbers: players, money in, and what's waiting for a moderator. */
@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly presence: PresenceService,
  ) {}

  async stats(): Promise<AdminDashboardDto> {
    const [players, revenue, moderation, online] = await Promise.all([
      this.dataSource.query<Array<Record<string, string>>>(
        `SELECT count(*) FILTER (WHERE purged_at IS NULL) AS total,
                count(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS new24h,
                count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS new7d,
                count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS new30d,
                count(*) FILTER (WHERE suspended_at IS NOT NULL AND deleted_at IS NULL) AS suspended,
                count(*) FILTER (WHERE deleted_at IS NOT NULL AND purged_at IS NULL) AS deleted,
                (SELECT count(DISTINCT user_id) FROM characters WHERE alive) AS with_character,
                (SELECT count(*) FROM characters WHERE alive AND last_active_at >= now() - interval '24 hours') AS active_today
           FROM users`,
      ),
      this.dataSource.query<Array<{ day: string; purpose: string; amount: string; payments: string }>>(
        `SELECT to_char(timezone('${LAGOS}', COALESCE(verified_at, created_at)), 'YYYY-MM-DD') AS day, purpose,
                sum(amount_kobo) AS amount, count(*) AS payments
           FROM payments
          WHERE status = 'success' AND COALESCE(verified_at, created_at) >= now() - interval '${DAYS} days'
          GROUP BY 1, 2`,
      ),
      this.dataSource.query<Array<Record<string, string>>>(
        `SELECT (SELECT count(*) FROM promotion_campaigns WHERE status = 'in-review') AS campaigns,
                (SELECT count(*) FROM promotion_club_orders WHERE status = 'in-review') AS club_orders,
                (SELECT count(*) FROM promotion_campaigns WHERE status = 'refund-due')
                  + (SELECT count(*) FROM promotion_club_orders WHERE status = 'refund-due') AS refunds_due,
                (SELECT count(*) FROM social_reports WHERE status IN ('open', 'reviewing')) AS open_reports`,
      ),
      this.presence.onlineCount().catch(() => 0),
    ]);

    const days = lastDays(DAYS);
    const byDay = new Map<string, { topup: number; billboard: number; club: number; payments: number }>(
      days.map((day) => [day, { topup: 0, billboard: 0, club: 0, payments: 0 }]),
    );
    for (const row of revenue) {
      const bucket = byDay.get(row.day);
      if (!bucket) continue;
      const amount = Number(row.amount);
      if (row.purpose === 'topup') bucket.topup += amount;
      else if (row.purpose === 'billboard') bucket.billboard += amount;
      else bucket.club += amount;
      bucket.payments += Number(row.payments);
    }
    const series: RevenueDayDto[] = days.map((date) => {
      const bucket = byDay.get(date) ?? { topup: 0, billboard: 0, club: 0, payments: 0 };
      return {
        date,
        topupKobo: bucket.topup,
        billboardKobo: bucket.billboard,
        clubPlayKobo: bucket.club,
        totalKobo: bucket.topup + bucket.billboard + bucket.club,
        payments: bucket.payments,
      };
    });
    const sumLast = (n: number): number => series.slice(-n).reduce((sum, day) => sum + day.totalKobo, 0);
    const p = players[0] ?? {};
    const m = moderation[0] ?? {};
    return {
      generatedAt: new Date().toISOString(),
      players: {
        total: Number(p.total ?? 0),
        new24h: Number(p.new24h ?? 0),
        new7d: Number(p.new7d ?? 0),
        new30d: Number(p.new30d ?? 0),
        online,
        activeToday: Number(p.active_today ?? 0),
        suspended: Number(p.suspended ?? 0),
        deletedPendingPurge: Number(p.deleted ?? 0),
        withCharacter: Number(p.with_character ?? 0),
      },
      revenue: { days: series, last30dKobo: sumLast(30), last7dKobo: sumLast(7), todayKobo: sumLast(1) },
      moderation: {
        campaignsInReview: Number(m.campaigns ?? 0),
        clubOrdersInReview: Number(m.club_orders ?? 0),
        refundsDue: Number(m.refunds_due ?? 0),
        openReports: Number(m.open_reports ?? 0),
      },
    };
  }
}

/** The last `count` calendar days in Lagos, oldest first, as `YYYY-MM-DD`. */
export function lastDays(count: number, now = Date.now()): string[] {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: LAGOS, year: 'numeric', month: '2-digit', day: '2-digit' });
  return Array.from({ length: count }, (_, index) => format.format(new Date(now - (count - 1 - index) * 86_400_000)));
}
