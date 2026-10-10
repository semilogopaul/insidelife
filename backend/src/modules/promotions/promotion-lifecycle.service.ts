import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { findAdSlot, type IsoDate } from '@insidelife/shared';
import { CampaignsService } from './campaigns.service.js';
import { adEndedNotice, adLiveNotice, songEndedNotice, songLiveNotice } from './promotions.notices.js';
import { PromotionsNotifier } from './promotions-notifier.service.js';
import { lagosToday } from './rules/schedule.rules.js';
import { TracksService } from './tracks.service.js';

const SWEEP_EVERY_MS = 60_000;

interface CampaignRow {
  readonly id: string;
  readonly owner_user_id: string;
  readonly title: string;
  readonly slot_id: string;
  readonly impressions: string | number;
  readonly unique_viewers: number;
}

interface OrderRow {
  readonly id: string;
  readonly owner_user_id: string;
  readonly artist_name: string;
  readonly title: string;
  readonly plays: string | number;
  readonly listeners: number;
  readonly clubs: string | number;
}

/**
 * Runs and ends ads and songs on their dates (every minute, on every node; each change is one conditional UPDATE …
 * RETURNING, so exactly one node sends each notice):
 *
 * - **Live.** An approved item whose first day has come is marked live and its buyer is told once ("Your ad is live",
 *   "Your song is in rotation"). Items approved after they had started were told by the approval itself.
 * - **Ended.** A paid item whose last day has passed is marked completed (Ended), keeps its final stats, and its buyer
 *   is told once with the totals and a "Run it again" button: views and different players for an ad; plays, clubs and
 *   listeners for a song.
 */
@Injectable()
export class PromotionLifecycle implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PromotionLifecycle.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notifier: PromotionsNotifier,
    private readonly campaigns: CampaignsService,
    private readonly tracks: TracksService,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(now: Date = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    const today = lagosToday(now);
    try {
      const changed = (await this.step(() => this.startCampaigns(today, now))) + (await this.step(() => this.endCampaigns(today, now)));
      if (changed > 0) this.campaigns.invalidateLive();
      const songs = (await this.step(() => this.startOrders(today, now))) + (await this.step(() => this.endOrders(today, now)));
      if (songs > 0) this.tracks.invalidateRotation();
    } finally {
      this.running = false;
    }
  }

  async startCampaigns(today: IsoDate, now: Date): Promise<number> {
    const rows = await this.update<CampaignRow>(
      `UPDATE promotion_campaigns SET status = 'live', live_notified_at = $2
        WHERE live_notified_at IS NULL AND status IN ('approved', 'live') AND start_date <= $1 AND end_date > $1
        RETURNING id, owner_user_id, title, slot_id, impressions, unique_viewers`,
      [today, now],
    );
    for (const row of rows) await this.notifier.notifyOwner(row.owner_user_id, adLiveNotice(row.id, row.title, findAdSlot(row.slot_id)?.name ?? 'your spot'));
    return rows.length;
  }

  async endCampaigns(today: IsoDate, now: Date): Promise<number> {
    const rows = await this.update<CampaignRow>(
      `UPDATE promotion_campaigns SET status = 'completed', ended_notified_at = $2
        WHERE ended_notified_at IS NULL AND status IN ('approved', 'live', 'completed') AND paid_at IS NOT NULL AND end_date <= $1
        RETURNING id, owner_user_id, title, slot_id, impressions, unique_viewers`,
      [today, now],
    );
    for (const row of rows) {
      await this.notifier.notifyOwner(row.owner_user_id, adEndedNotice(row.id, row.title, findAdSlot(row.slot_id)?.name ?? 'your spot', Number(row.impressions), Number(row.unique_viewers)));
    }
    return rows.length;
  }

  async startOrders(today: IsoDate, now: Date): Promise<number> {
    const rows = await this.update<OrderRow>(
      `UPDATE promotion_club_orders o SET status = 'live', live_notified_at = $2
         FROM promotion_tracks t
        WHERE t.id = o.track_id AND o.live_notified_at IS NULL AND o.status IN ('approved', 'live') AND o.start_date <= $1 AND o.end_date > $1
        RETURNING o.id, o.owner_user_id, t.artist_name, t.title, o.plays, o.listeners, 0 AS clubs`,
      [today, now],
    );
    for (const row of rows) await this.notifier.notifyOwner(row.owner_user_id, songLiveNotice(row.id, `${row.artist_name} – ${row.title}`));
    return rows.length;
  }

  async endOrders(today: IsoDate, now: Date): Promise<number> {
    const rows = await this.update<OrderRow>(
      `UPDATE promotion_club_orders o SET status = 'completed', ended_notified_at = $2
         FROM promotion_tracks t
        WHERE t.id = o.track_id AND o.ended_notified_at IS NULL AND o.status IN ('approved', 'live', 'completed') AND o.paid_at IS NOT NULL AND o.end_date <= $1
        RETURNING o.id, o.owner_user_id, t.artist_name, t.title, o.plays, o.listeners,
                  (SELECT COUNT(DISTINCT p.venue_id) FROM promotion_club_plays p WHERE p.order_id = o.id) AS clubs`,
      [today, now],
    );
    for (const row of rows) {
      await this.notifier.notifyOwner(row.owner_user_id, songEndedNotice(row.id, `${row.artist_name} – ${row.title}`, Number(row.plays), Number(row.listeners), Number(row.clubs)));
    }
    return rows.length;
  }

  private async update<T>(sql: string, parameters: readonly unknown[]): Promise<T[]> {
    const result = (await this.dataSource.query(sql, [...parameters])) as [T[], number] | T[];
    // node-postgres through TypeORM returns [rows, affected] for UPDATE … RETURNING.
    return Array.isArray(result[0]) ? (result[0] as T[]) : (result as T[]);
  }

  private async step(work: () => Promise<number>): Promise<number> {
    try {
      return await work();
    } catch (error) {
      this.logger.warn({ err: error }, 'Promotion lifecycle step failed');
      return 0;
    }
  }
}
