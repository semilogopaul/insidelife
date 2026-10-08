import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import type { DataSource } from 'typeorm';
import {
  LEADERBOARDS,
  LEADERBOARD_SIZE,
  type LeaderboardBoardId,
  type LeaderboardDto,
  type LeaderboardEntryDto,
  type LeaderboardYouDto,
} from '@insidelife/shared';
import { REDIS } from '../../common/redis/redis.module.js';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import { SELF_MADE_SQL, presentLeaderboardValue, type LeaderboardRow } from './rules/leaderboard.rules.js';
import { statusTierDto } from './rules/profile.rules.js';

const CACHE_TTL_SECONDS = 60;
const CACHE_PREFIX = 'social:leaderboard:v1';

interface RankedRow extends LeaderboardRow {
  readonly rank: number;
}

interface CachedBoard {
  readonly generatedAt: string;
  readonly rows: readonly RankedRow[];
}

interface CachedYou {
  readonly rank: number | null;
  readonly row: LeaderboardRow | null;
}

/** Raw SQL row shared by every board query (numeric/bigint columns arrive as strings). */
interface SqlRow {
  readonly id: string;
  readonly handle: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly status: number | string;
  readonly value: number | string;
  readonly show_exact_wealth: boolean | null;
  readonly degree_label: string | null;
  readonly married: boolean | null;
  readonly children_count: number | string | null;
  readonly generations: number | string;
  readonly rank?: number | string;
}

interface RankSqlRow extends SqlRow {
  readonly qualifies: boolean;
}

/** Per-character boards: the value expression and which rows qualify (over characters `c` ⟕ social_profiles `p`). */
const CHARACTER_BOARDS: Readonly<Record<Exclude<LeaderboardBoardId, 'dynasties'>, { readonly value: string; readonly qualifies: string }>> = {
  'self-made': { value: SELF_MADE_SQL, qualifies: `${SELF_MADE_SQL} > 0` },
  earners: { value: 'COALESCE(p.monthly_income, 0)', qualifies: 'COALESCE(p.monthly_income, 0) > 0' },
  scholars: { value: 'p.best_cgpa', qualifies: 'p.best_cgpa IS NOT NULL' },
  influence: { value: 'c.status', qualifies: 'c.status > 0' },
  families: {
    value: '(COALESCE(p.children_count, 0) + CASE WHEN COALESCE(p.married, false) THEN 1 ELSE 0 END)',
    qualifies: '(COALESCE(p.children_count, 0) + CASE WHEN COALESCE(p.married, false) THEN 1 ELSE 0 END) > 0',
  },
};

const CHARACTER_COLUMNS = `c.id, c.handle, c.first_name, c.last_name, c.status,
       COALESCE(p.show_exact_wealth, false) AS show_exact_wealth, p.degree_label,
       COALESCE(p.married, false) AS married, COALESCE(p.children_count, 0) AS children_count, 1 AS generations`;

const DYNASTY_CTE = `WITH d AS (
       SELECT c.dynasty_id, SUM(${SELF_MADE_SQL}) AS value, COUNT(*) AS generations, MAX(c.generation) AS head_generation
         FROM characters c
     GROUP BY c.dynasty_id)`;

/**
 * Leaderboards computed in SQL over the characters table (money and clout, always fresh after each settle) and the
 * social profile cache (income, CGPA, family). Top 100 per board is cached in Redis for 60 s; "your rank" too.
 * Unearned and purchased money never reaches the self-made or dynasty boards (see `SELF_MADE_SQL`).
 */
@Injectable()
export class LeaderboardsService {
  private readonly logger = new Logger(LeaderboardsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async board(board: LeaderboardBoardId, viewer: CharacterEntity | null): Promise<LeaderboardDto> {
    const [top, you] = await Promise.all([this.top(board), viewer ? this.you(board, viewer) : Promise.resolve(null)]);
    const definition = LEADERBOARDS[board];
    return {
      board,
      title: definition.title,
      blurb: definition.blurb,
      entries: top.rows.map((row) => this.entry(board, row, row.characterId === viewer?.id)),
      you: you ? this.youDto(board, you) : null,
      generatedAt: top.generatedAt,
    };
  }

  private entry(board: LeaderboardBoardId, row: RankedRow, isSelf: boolean): LeaderboardEntryDto {
    const shown = presentLeaderboardValue(board, row, isSelf);
    return {
      rank: row.rank,
      characterId: row.characterId,
      handle: row.handle,
      firstName: row.firstName,
      lastName: row.lastName,
      status: row.status,
      statusTier: statusTierDto(row.status),
      value: shown.value,
      display: shown.display,
      detail: shown.detail,
    };
  }

  private youDto(board: LeaderboardBoardId, you: CachedYou): LeaderboardYouDto {
    if (!you.row || you.rank === null) return { rank: null, value: null, display: 'Not ranked yet — keep grinding' };
    const shown = presentLeaderboardValue(board, you.row, true);
    return { rank: you.rank, value: shown.value, display: shown.display };
  }

  private top(board: LeaderboardBoardId): Promise<CachedBoard> {
    return this.cached(`${CACHE_PREFIX}:${board}`, async () => ({
      generatedAt: new Date().toISOString(),
      rows: (board === 'dynasties' ? await this.dynastyRows() : await this.characterRows(board)).map((row) => ({
        ...this.toRow(row),
        rank: Number(row.rank ?? 0),
      })),
    }));
  }

  private you(board: LeaderboardBoardId, viewer: CharacterEntity): Promise<CachedYou> {
    return this.cached(`${CACHE_PREFIX}:${board}:you:${viewer.id}`, () => (board === 'dynasties' ? this.dynastyRank(viewer) : this.characterRank(board, viewer)));
  }

  private characterRows(board: Exclude<LeaderboardBoardId, 'dynasties'>): Promise<SqlRow[]> {
    const { value, qualifies } = CHARACTER_BOARDS[board];
    return this.dataSource.query(
      `SELECT ${CHARACTER_COLUMNS}, ${value} AS value, RANK() OVER (ORDER BY ${value} DESC) AS rank
         FROM characters c
    LEFT JOIN social_profiles p ON p.character_id = c.id
        WHERE c.alive AND ${qualifies}
     ORDER BY ${value} DESC, c.id
        LIMIT ${LEADERBOARD_SIZE}`,
    );
  }

  private async characterRank(board: Exclude<LeaderboardBoardId, 'dynasties'>, viewer: CharacterEntity): Promise<CachedYou> {
    const { value, qualifies } = CHARACTER_BOARDS[board];
    const mine: RankSqlRow[] = await this.dataSource.query(
      `SELECT ${CHARACTER_COLUMNS}, ${value} AS value, (${qualifies}) AS qualifies
         FROM characters c
    LEFT JOIN social_profiles p ON p.character_id = c.id
        WHERE c.id = $1`,
      [viewer.id],
    );
    const row = mine[0];
    if (!row || !row.qualifies) return { rank: null, row: row ? this.toRow(row) : null };
    const ahead: Array<{ ahead: string }> = await this.dataSource.query(
      `SELECT COUNT(*) AS ahead
         FROM characters c
    LEFT JOIN social_profiles p ON p.character_id = c.id
        WHERE c.alive AND ${qualifies} AND ${value} > $1`,
      [row.value],
    );
    return { rank: Number(ahead[0]?.ahead ?? 0) + 1, row: this.toRow(row) };
  }

  private dynastyRows(): Promise<SqlRow[]> {
    return this.dataSource.query(
      `${DYNASTY_CTE}
       SELECT h.id, h.handle, h.first_name, h.last_name, h.status, d.value, d.generations,
              false AS show_exact_wealth, NULL AS degree_label, false AS married, 0 AS children_count,
              RANK() OVER (ORDER BY d.value DESC) AS rank
         FROM d
         JOIN characters h ON h.dynasty_id = d.dynasty_id AND h.generation = d.head_generation
        WHERE d.value > 0
     ORDER BY d.value DESC, h.id
        LIMIT ${LEADERBOARD_SIZE}`,
    );
  }

  private async dynastyRank(viewer: CharacterEntity): Promise<CachedYou> {
    const mine: Array<{ value: string; generations: string }> = await this.dataSource.query(
      `SELECT SUM(${SELF_MADE_SQL}) AS value, COUNT(*) AS generations FROM characters c WHERE c.dynasty_id = $1`,
      [viewer.dynastyId],
    );
    const value = Number(mine[0]?.value ?? 0);
    const row: LeaderboardRow = {
      characterId: viewer.id,
      handle: viewer.handle,
      firstName: viewer.firstName,
      lastName: viewer.lastName,
      status: viewer.status,
      value,
      showExactWealth: false,
      degreeLabel: null,
      married: false,
      children: 0,
      generations: Number(mine[0]?.generations ?? 1),
    };
    if (value <= 0) return { rank: null, row };
    const ahead: Array<{ ahead: string }> = await this.dataSource.query(`${DYNASTY_CTE} SELECT COUNT(*) AS ahead FROM d WHERE d.value > $1`, [value]);
    return { rank: Number(ahead[0]?.ahead ?? 0) + 1, row };
  }

  private toRow(row: SqlRow): LeaderboardRow {
    return {
      characterId: row.id,
      handle: row.handle,
      firstName: row.first_name,
      lastName: row.last_name,
      status: Number(row.status),
      value: Number(row.value),
      showExactWealth: row.show_exact_wealth === true,
      degreeLabel: row.degree_label,
      married: row.married === true,
      children: Number(row.children_count ?? 0),
      generations: Number(row.generations),
    };
  }

  /** Redis read-through cache; a Redis hiccup degrades to computing fresh rather than failing the request. */
  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    try {
      const hit = await this.redis.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch (error) {
      this.logger.warn(`Leaderboard cache read failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
    const value = await load();
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(`Leaderboard cache write failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
    return value;
  }
}
