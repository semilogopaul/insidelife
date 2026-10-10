import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import {
  FOBES_LISTS,
  FOBES_LIST_LIMIT,
  FOBES_PAGE_SIZE,
  MINUTES_PER_DAY,
  dayIndexOf,
  isFobesMoversList,
  selfMadeNetWorthOf,
  yearsBetween,
  type FobesListDto,
  type FobesListId,
  type FobesMeDto,
  type FobesPositionDto,
  type GameMinute,
} from '@insidelife/shared';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import { WorldService } from '../world/world.service.js';
import { FobesSnapshotsService } from './fobes-snapshots.service.js';
import { RankingCache } from './ranking-cache.service.js';
import {
  FOBES_RANKABLE_SQL,
  isUnder30,
  listValueOf,
  pageCount,
  presentAmount,
  presentEntry,
  rankedListSql,
  wealthMix,
  type FobesRankedList,
  type FobesRow,
} from './rules/fobes.rules.js';

const CACHE_PREFIX = 'social:fobes:v1';

/** What every list row reads (numeric/bigint columns arrive as strings). */
const ROW_COLUMNS = `c.id, c.handle, c.first_name, c.last_name, c.born_at, c.status, c.generation,
       c.net_worth, c.unearned_total, c.purchased_total, p.title, COALESCE(p.show_exact_wealth, false) AS show_exact_wealth`;

interface SqlRow {
  readonly id: string;
  readonly handle: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly born_at: string;
  readonly status: number | string;
  readonly generation: number | string;
  readonly net_worth: string;
  readonly unearned_total: string;
  readonly purchased_total: string;
  readonly title: string | null;
  readonly show_exact_wealth: boolean;
  readonly value: string;
  readonly rank?: string | number;
  readonly before?: string | null;
  readonly rank_before?: number | string | null;
  readonly new_entry?: boolean;
}

/** A whole list (at most the top 100), cached raw; pages are slices and privacy is applied per viewer. */
interface CachedList {
  readonly generatedAt: string;
  readonly since: GameMinute | null;
  readonly rows: readonly FobesRow[];
}

type CachedMe = Omit<FobesMeDto, 'showExactWealth'>;

/**
 * Fobes, the Lagos Rich List: the top 100 by net worth, self-made worth (the leaderboards' `SELF_MADE_SQL`) and under
 * 30, plus the week's risers and fallers from the daily snapshots, and where you stand (your rank among everyone, and
 * the gap to the next place or to the top 100). Lists are cached in Redis for 60 s (`RankingCache`, shared with the
 * leaderboards); dead characters and deleted accounts' characters never appear.
 */
@Injectable()
export class FobesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: RankingCache,
    private readonly world: WorldService,
    private readonly snapshots: FobesSnapshotsService,
  ) {}

  async list(list: FobesListId, page: number, viewer: CharacterEntity | null): Promise<FobesListDto> {
    const now = this.world.now();
    const cached = await this.cache.get<CachedList>(`${CACHE_PREFIX}:list:${list}`, () =>
      isFobesMoversList(list) ? this.moversList(list, now) : this.rankedList(list, now),
    );
    const start = (page - 1) * FOBES_PAGE_SIZE;
    return {
      list,
      title: FOBES_LISTS[list].title,
      blurb: FOBES_LISTS[list].blurb,
      page,
      pageSize: FOBES_PAGE_SIZE,
      totalPages: pageCount(cached.rows.length, FOBES_PAGE_SIZE),
      total: cached.rows.length,
      entries: cached.rows.slice(start, start + FOBES_PAGE_SIZE).map((row) => presentEntry(row, viewer?.id ?? null, now)),
      since: cached.since,
      generatedAt: cached.generatedAt,
    };
  }

  async me(viewer: CharacterEntity): Promise<FobesMeDto> {
    const now = this.world.now();
    // Read fresh (not cached) so flipping the privacy switch shows here at once.
    const privacy: Array<{ show_exact_wealth: boolean }> = await this.dataSource.query(`SELECT show_exact_wealth FROM social_profiles WHERE character_id = $1`, [viewer.id]);
    const body = await this.cache.get<CachedMe>(`${CACHE_PREFIX}:me:${viewer.id}`, () => this.loadMe(viewer, now));
    return { ...body, showExactWealth: privacy[0]?.show_exact_wealth === true };
  }

  private async loadMe(viewer: CharacterEntity, now: GameMinute): Promise<CachedMe> {
    const today = dayIndexOf(now);
    await this.snapshots.recordViewer(viewer.id, viewer.netWorth, today);
    const richList = await this.position('rich-list', viewer, now);
    const selfMadeList = await this.position('self-made', viewer, now);
    const under30 = isUnder30(viewer.bornAt, now) ? await this.position('under-30', viewer, now) : null;
    const start = await this.snapshots.viewerWeekStart(viewer.id, today);
    const change = start ? Math.round(viewer.netWorth - start.netWorth) : 0;
    return {
      characterId: viewer.id,
      handle: viewer.handle,
      age: yearsBetween(viewer.bornAt, now),
      netWorth: Math.round(viewer.netWorth),
      selfMade: selfMadeNetWorthOf(viewer.netWorth, viewer.unearnedTotal),
      mix: wealthMix(viewer.netWorth, viewer.unearnedTotal, viewer.purchasedTotal, viewer.generation),
      richList,
      selfMadeList,
      under30,
      week: start
        ? { change, pct: start.netWorth > 0 ? Math.round((change / start.netWorth) * 1000) / 10 : null, since: start.day * MINUTES_PER_DAY }
        : null,
      generatedAt: new Date().toISOString(),
    };
  }

  // ----- Ranked lists ---------------------------------------------------------------------------------------------

  private async rankedList(list: FobesRankedList, now: GameMinute): Promise<CachedList> {
    const { value, qualifies, params } = rankedListSql(list, now);
    const rows: SqlRow[] = await this.dataSource.query(
      `WITH top AS (
         SELECT c.id, ${value} AS value
           FROM characters c
          WHERE ${FOBES_RANKABLE_SQL} AND ${qualifies}
       ORDER BY ${value} DESC, c.id
          LIMIT ${FOBES_LIST_LIMIT}),
       ranked AS (
         SELECT id, value, RANK() OVER (ORDER BY value DESC) AS rank, ROW_NUMBER() OVER (ORDER BY value DESC, id) AS position FROM top)
       SELECT ${ROW_COLUMNS}, r.value, r.rank
         FROM ranked r
         JOIN characters c ON c.id = r.id
    LEFT JOIN social_profiles p ON p.character_id = c.id
     ORDER BY r.position`,
      [...params],
    );
    return { generatedAt: new Date().toISOString(), since: null, rows: rows.map((row) => this.toRow(row, Number(row.rank ?? 0))) };
  }

  /**
   * Your place on a list: your rank among everyone (index range count, so it works beyond the top 100), and who to beat
   * next — the nearest figure above yours while you're in the top 100, else #100. The gap is exact only if that player
   * shows their exact wealth (otherwise you could work their figure out from yours).
   */
  private async position(list: FobesRankedList, viewer: CharacterEntity, now: GameMinute): Promise<FobesPositionDto> {
    const worth = listValueOf(list, viewer);
    if (worth <= 0) return { list, rank: null, inTop: false, worth, next: null };
    const { value, qualifies, params } = rankedListSql(list, now);
    const mine = params.length + 1;
    const ahead: Array<{ n: string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS n FROM characters c WHERE ${FOBES_RANKABLE_SQL} AND ${qualifies} AND ${value} > $${mine}`,
      [...params, worth],
    );
    const rank = Number(ahead[0]?.n ?? 0) + 1;
    const inTop = rank <= FOBES_LIST_LIMIT;
    if (rank === 1) return { list, rank, inTop, worth, next: null };
    if (inTop) {
      const above: Array<{ value: string; exact: boolean; ties: string }> = await this.dataSource.query(
        `SELECT ${value} AS value, bool_and(COALESCE(p.show_exact_wealth, false)) AS exact, COUNT(*) AS ties
           FROM characters c
      LEFT JOIN social_profiles p ON p.character_id = c.id
          WHERE ${FOBES_RANKABLE_SQL} AND ${qualifies}
            AND ${value} = (SELECT MIN(${value}) FROM characters c WHERE ${FOBES_RANKABLE_SQL} AND ${qualifies} AND ${value} > $${mine})
       GROUP BY 1`,
        [...params, worth],
      );
      const next = above[0];
      if (!next) return { list, rank, inTop, worth, next: null };
      return { list, rank, inTop, worth, next: { rank: rank - Number(next.ties), gap: presentAmount(Number(next.value) - worth, next.exact === true) } };
    }
    const last: Array<{ value: string; exact: boolean }> = await this.dataSource.query(
      `SELECT ${value} AS value, COALESCE(p.show_exact_wealth, false) AS exact
         FROM characters c
    LEFT JOIN social_profiles p ON p.character_id = c.id
        WHERE ${FOBES_RANKABLE_SQL} AND ${qualifies}
     ORDER BY ${value} DESC, c.id
       OFFSET ${FOBES_LIST_LIMIT - 1} LIMIT 1`,
      [...params],
    );
    const bar = last[0];
    return { list, rank, inTop, worth, next: bar ? { rank: FOBES_LIST_LIMIT, gap: presentAmount(Number(bar.value) - worth, bar.exact === true) } : null };
  }

  // ----- Risers and fallers ---------------------------------------------------------------------------------------

  /**
   * The week's movers: everyone in the top-100 snapshot a week ago, against their live net worth now. Risers also get
   * new entries (in the latest top 100 but not a week ago); their starting point is unknown, so they show "New entry"
   * and sort by a floor estimate: ₦0 if a week ago's list wasn't full (they had nothing to count then), else that
   * list's lowest figure. Dying or deleting your account takes you off; it isn't a fall.
   */
  private async moversList(list: 'risers' | 'fallers', now: GameMinute): Promise<CachedList> {
    const window = await this.snapshots.moversWindow(dayIndexOf(now));
    const generatedAt = new Date().toISOString();
    if (!window) return { generatedAt, since: null, rows: [] };
    const risers = list === 'risers';
    const rows: SqlRow[] = await this.dataSource.query(
      `WITH base AS (
         SELECT s.character_id, s.net_worth AS before, s.rank AS rank_before
           FROM fobes_snapshots s WHERE s.day = $1 AND s.rank IS NOT NULL),
       entry_bar AS (SELECT CASE WHEN COUNT(*) < ${FOBES_LIST_LIMIT} THEN 0 ELSE MIN(before) END AS before FROM base),
       moves AS (
         SELECT b.character_id AS id, b.before, b.rank_before, false AS new_entry FROM base b
         ${
           risers
             ? `UNION ALL
         SELECT t.character_id, (SELECT before FROM entry_bar), NULL, true
           FROM fobes_snapshots t
          WHERE t.day = $2 AND t.day > $1 AND t.rank IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM base b WHERE b.character_id = t.character_id)`
             : ''
         })
       SELECT ${ROW_COLUMNS}, c.net_worth AS value, m.before, m.rank_before, m.new_entry
         FROM moves m
         JOIN characters c ON c.id = m.id
    LEFT JOIN social_profiles p ON p.character_id = c.id
        WHERE ${FOBES_RANKABLE_SQL} AND c.net_worth ${risers ? '>' : '<'} m.before
     ORDER BY (c.net_worth - m.before) ${risers ? 'DESC' : 'ASC'}, c.id
        LIMIT ${FOBES_LIST_LIMIT}`,
      risers ? [window.baseDay, window.latestDay] : [window.baseDay],
    );
    return {
      generatedAt,
      since: window.baseDay * MINUTES_PER_DAY,
      rows: rows.map((row, index) =>
        this.toRow(row, index + 1, {
          before: Number(row.before ?? 0),
          rankBefore: row.rank_before === null || row.rank_before === undefined ? null : Number(row.rank_before),
          newEntry: row.new_entry === true,
        }),
      ),
    };
  }

  private toRow(row: SqlRow, rank: number, move: FobesRow['move'] = null): FobesRow {
    return {
      rank,
      characterId: row.id,
      handle: row.handle,
      firstName: row.first_name,
      lastName: row.last_name,
      bornAt: Number(row.born_at),
      status: Number(row.status),
      title: row.title,
      generation: Number(row.generation),
      netWorth: Number(row.net_worth),
      unearnedTotal: Number(row.unearned_total),
      purchasedTotal: Number(row.purchased_total),
      showExactWealth: row.show_exact_wealth === true,
      value: Number(row.value),
      move,
    };
  }
}
