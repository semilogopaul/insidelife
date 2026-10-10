import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { FOBES_LIST_LIMIT, FOBES_SNAPSHOT_RETENTION_DAYS, dayIndexOf } from '@insidelife/shared';
import { WorldService } from '../world/world.service.js';
import { FOBES_RANKABLE_SQL, moversWindowStart } from './rules/fobes.rules.js';

/** The days movers compare: the oldest top-100 snapshot in the window (a week ago) and the latest one. */
export interface MoversWindow {
  readonly baseDay: number;
  readonly latestDay: number;
}

/**
 * Fobes' history, kept cheap at any player count: once per game day a world tick (`FobesSnapshotProcessor`, a BullMQ
 * job every real minute) copies the top 100 by net worth into `fobes_snapshots` with one INSERT … SELECT over the
 * net-worth index, and prunes old days. A viewer's own value is added when they open Fobes, so "your week" works
 * outside the top 100. A per-character simulation hook would need a rank query for every character every day; this is
 * one statement a day.
 */
@Injectable()
export class FobesSnapshotsService {
  private readonly logger = new Logger(FobesSnapshotsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly world: WorldService,
  ) {}

  /** Take today's top 100 if it isn't taken yet (idempotent: safe on every node and on retries). */
  async takeDaily(): Promise<{ readonly day: number; readonly taken: number }> {
    const day = dayIndexOf(this.world.now());
    const existing: unknown[] = await this.dataSource.query(`SELECT 1 FROM fobes_snapshots WHERE day = $1 AND rank IS NOT NULL LIMIT 1`, [day]);
    if (existing.length > 0) return { day, taken: 0 };
    const taken = await this.dataSource.transaction(async (manager) => {
      const rows: unknown[] = await manager.query(
        `INSERT INTO fobes_snapshots (day, character_id, net_worth, rank)
         SELECT $1, top.id, top.net_worth, RANK() OVER (ORDER BY top.net_worth DESC)
           FROM (SELECT c.id, c.net_worth FROM characters c
                  WHERE ${FOBES_RANKABLE_SQL} AND c.net_worth > 0
               ORDER BY c.net_worth DESC, c.id
                  LIMIT ${FOBES_LIST_LIMIT}) top
         ON CONFLICT (day, character_id) DO UPDATE SET net_worth = EXCLUDED.net_worth, rank = EXCLUDED.rank
         RETURNING 1`,
        [day],
      );
      await manager.query(`DELETE FROM fobes_snapshots WHERE day < $1`, [day - FOBES_SNAPSHOT_RETENTION_DAYS]);
      return rows.length;
    });
    if (taken > 0) this.logger.log(`Fobes snapshot for day ${day}: ${taken} characters`);
    return { day, taken };
  }

  /** Remember the viewer's value today (their own row; never overwrites the top-100 snapshot). */
  async recordViewer(characterId: string, netWorth: number, day: number): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO fobes_snapshots (day, character_id, net_worth, rank) VALUES ($1, $2, $3, NULL) ON CONFLICT (day, character_id) DO NOTHING`,
      [day, characterId, Math.round(netWorth)],
    );
  }

  /** The viewer's earliest value within the week (null if Fobes has never seen them). */
  async viewerWeekStart(characterId: string, today: number): Promise<{ readonly day: number; readonly netWorth: number } | null> {
    const rows: Array<{ day: number; net_worth: string }> = await this.dataSource.query(
      `SELECT day, net_worth FROM fobes_snapshots WHERE character_id = $1 AND day >= $2 ORDER BY day ASC LIMIT 1`,
      [characterId, moversWindowStart(today)],
    );
    const row = rows[0];
    return row ? { day: Number(row.day), netWorth: Number(row.net_worth) } : null;
  }

  /** Null until the first top-100 snapshot exists. */
  async moversWindow(today: number): Promise<MoversWindow | null> {
    const rows: Array<{ base: number | null; latest: number | null }> = await this.dataSource.query(
      `SELECT MIN(day) AS base, MAX(day) AS latest FROM fobes_snapshots WHERE day >= $1 AND rank IS NOT NULL`,
      [moversWindowStart(today)],
    );
    const row = rows[0];
    return row && row.base !== null && row.latest !== null ? { baseDay: Number(row.base), latestDay: Number(row.latest) } : null;
  }
}
