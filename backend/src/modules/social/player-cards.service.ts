import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import type { PlayerCardDto } from '@insidelife/shared';
import { PresenceService } from '../presence/presence.service.js';
import { statusTierDto } from './rules/profile.rules.js';

/** Columns every card query selects (characters `c` LEFT JOIN social_profiles `p`). */
export const CARD_COLUMNS = 'c.id, c.handle, c.first_name, c.last_name, c.status, p.title';

export interface CardRow {
  readonly id: string;
  readonly handle: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly status: number;
  readonly title: string | null;
}

/**
 * Builds compact public player cards (name, clout tier, title, online) in bulk: one SQL query plus one Redis lookup
 * per player. Only public fields — never balances, email or birth-lottery background.
 */
@Injectable()
export class PlayerCardsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly presence: PresenceService,
  ) {}

  /**
   * Cards for these characters. `visibleOnly` leaves out characters hidden because their account was deleted (lists a
   * player looks at: friends, requests, mutual friends); history (a party's past sprays) keeps them.
   */
  async cards(ids: readonly string[], manager: EntityManager = this.dataSource.manager, options: { readonly visibleOnly?: boolean } = {}): Promise<Map<string, PlayerCardDto>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows: CardRow[] = await manager.query(
      `SELECT ${CARD_COLUMNS}
         FROM characters c
    LEFT JOIN social_profiles p ON p.character_id = c.id
        WHERE c.id = ANY($1::uuid[])${options.visibleOnly ? ' AND c.hidden_at IS NULL' : ''}`,
      [unique],
    );
    const online = await this.onlineSet(rows.map((row) => row.id));
    return new Map(rows.map((row) => [row.id, this.toCard(row, online.has(row.id))]));
  }

  async card(id: string, manager?: EntityManager, options: { readonly visibleOnly?: boolean } = {}): Promise<PlayerCardDto | null> {
    return (await this.cards([id], manager, options)).get(id) ?? null;
  }

  toCard(row: CardRow, online: boolean): PlayerCardDto {
    return {
      id: row.id,
      handle: row.handle,
      firstName: row.first_name,
      lastName: row.last_name,
      status: Number(row.status),
      statusTier: statusTierDto(Number(row.status)),
      title: row.title,
      online,
    };
  }

  async onlineSet(ids: readonly string[]): Promise<Set<string>> {
    const flags = await Promise.all(ids.map(async (id) => [id, await this.presence.isOnline(id)] as const));
    return new Set(flags.filter(([, online]) => online).map(([id]) => id));
  }
}
