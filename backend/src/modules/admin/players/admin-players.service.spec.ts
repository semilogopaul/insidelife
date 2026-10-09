import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../../config/configuration.js';
import type { AccountLifecycleService } from '../../accounts/account-lifecycle.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { CharacterSession } from '../../simulation/character-session.service.js';
import type { WorldService } from '../../world/world.service.js';
import { AdminPlayersService } from './admin-players.service.js';

const row = {
  user_id: 'u1',
  email: 'tolu@example.com',
  email_verified_at: null,
  role: 'player',
  created_at: new Date('2026-10-01T10:00:00Z'),
  last_login_at: new Date('2026-10-08T10:00:00Z'),
  suspended_at: new Date('2026-10-09T10:00:00Z'),
  deleted_at: null,
  purge_after: null,
  purged_at: null,
  character_id: 'c1',
  handle: 'tolu_b',
  first_name: 'Tolu',
  last_name: 'Bakare',
  alive: true,
  net_worth: '250000',
  last_active_at: new Date('2026-10-09T09:00:00Z'),
  hidden_at: null,
  cash: '-12',
};

/** Captures every SQL statement and its parameters; answers row queries with `rows` and counts with `total`. */
function fakeDb(rows: unknown[], total: number) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    return /count\(\*\) AS total/.test(sql) ? [{ total: String(total) }] : rows;
  });
  return { calls, dataSource: { query, manager: {} } as unknown as DataSource };
}

function service(dataSource: DataSource) {
  const config = { get: () => ['owner@insidelife.online'] } as unknown as ConfigService<AppConfig, true>;
  return new AdminPlayersService(
    dataSource,
    {} as AccountLifecycleService,
    {} as CharacterSession,
    new AuditService(dataSource),
    { now: () => 0 } as unknown as WorldService,
    config,
  );
}

describe('AdminPlayersService list and export', () => {
  it('pages, filters, searches and sorts on the server', async () => {
    const db = fakeDb([row], 31);
    const page = await service(db.dataSource).list(
      { status: 'suspended', q: '@Tolu', sort: 'netWorth', order: 'asc', from: '2026-10-01', activeFrom: '2026-10-05' },
      { page: 2, pageSize: 10 },
    );
    const [select, count] = db.calls;
    expect(select?.sql).toContain('u.suspended_at IS NOT NULL AND u.deleted_at IS NULL');
    expect(select?.sql).toContain('ORDER BY c.net_worth ASC NULLS LAST');
    expect(select?.sql).toContain('LIMIT 10 OFFSET 10');
    expect(select?.params).toContain('%tolu%');
    expect(select?.params).toContainEqual(new Date('2026-10-01'));
    expect(select?.params.at(-1)).toEqual(['owner@insidelife.online']);
    // The count has the same filters, without paging or the owners list used only for the role column.
    expect(count?.sql).not.toMatch(/OFFSET/);
    expect(count?.params).toEqual(select?.params.slice(0, -1));
    expect(page).toMatchObject({ page: 2, pageSize: 10, total: 31, pageCount: 4 });
    expect(page.items[0]).toMatchObject({
      userId: 'u1',
      status: 'suspended',
      cash: -12,
      character: { handle: 'tolu_b', netWorth: 250000, hidden: false },
    });
  });

  it('exports the same rows as CSV with formula-safe cells', async () => {
    const db = fakeDb([{ ...row, email: '=cmd@example.com' }], 1);
    const { csv, rows } = await service(db.dataSource).exportCsv({ status: 'all' });
    expect(rows).toBe(1);
    expect(db.calls[0]?.sql).toContain('LIMIT 50000');
    const [header, line] = csv.replace('﻿', '').split('\r\n');
    expect(header).toMatch(/^User id,Email,Email verified,Role,Status,Handle/);
    expect(line).toContain("'=cmd@example.com");
    expect(line).toContain('@tolu_b');
  });
});

describe('AuditService list', () => {
  it('filters by actor, action prefix, target and date range, newest first', async () => {
    const db = fakeDb([], 0);
    await new AuditService(db.dataSource).list(
      { actor: 'mod@', action: 'player.', targetType: 'player', targetId: 'u1', from: '2026-10-01', to: '2026-10-10', q: 'tolu' },
      { page: 3, pageSize: 25 },
    );
    const select = db.calls[0];
    expect(select?.sql).toContain('actor_email ILIKE');
    expect(select?.sql).toContain('action LIKE');
    expect(select?.sql).toContain('target_type =');
    expect(select?.sql).toContain('occurred_at >=');
    expect(select?.sql).toContain('occurred_at <');
    expect(select?.sql).toContain('ORDER BY occurred_at DESC, id DESC LIMIT 25 OFFSET 50');
    expect(select?.params).toEqual(expect.arrayContaining(['%tolu%', '%mod@%', 'player.%', 'player', 'u1']));
  });
});
