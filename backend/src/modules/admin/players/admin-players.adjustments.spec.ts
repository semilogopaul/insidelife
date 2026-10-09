import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { DomainException } from '../../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../../config/configuration.js';
import type { AccountLifecycleService } from '../../accounts/account-lifecycle.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { AuditActor, AuditEntryInput } from '../../audit/audit.types.js';
import type { CharacterSession } from '../../simulation/character-session.service.js';
import type { UserEntity } from '../../users/entities/user.entity.js';
import type { WorldService } from '../../world/world.service.js';
import { ADMIN_DAILY_CREDIT_CAP, AdminPlayersService, OWNER_ONLY_CREDIT_ABOVE } from './admin-players.service.js';

const OWNER_EMAIL = 'owner@insidelife.online';
const admin: AuditActor = { userId: 'admin-1', email: 'mod@insidelife.online', role: 'admin', ip: null, userAgent: null, traceId: null };
const owner: AuditActor = { ...admin, userId: 'owner-1', email: OWNER_EMAIL, role: 'owner' };

const account = (id: string, overrides: Partial<UserEntity> = {}): UserEntity => ({ id, email: `${id}@example.com`, role: 'player', ...overrides }) as UserEntity;

/**
 * Every account in `users`, a character session that runs the work against one fake manager, and an audit log that
 * the daily-credit query sums (like the real `SELECT SUM(...) FROM audit_logs`).
 */
function setup(users: readonly UserEntity[]) {
  const auditLog: Array<{ actorUserId: string | null; action: string; amount: number; at: Date }> = [];
  const queries: string[] = [];
  let cash = 1_000_000;
  const manager = {
    findOne: async (_entity: unknown, { where }: { where: { id: string } }) => users.find((user) => user.id === where.id) ?? null,
    exists: async () => false,
    query: async (sql: string, params: unknown[]) => {
      queries.push(sql.includes('pg_advisory_xact_lock') ? 'lock' : sql.includes('SUM(') ? 'sum' : sql);
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('SUM(')) {
        const [actorId, since] = params as [string, Date];
        const total = auditLog
          .filter((entry) => entry.actorUserId === actorId && entry.action === 'wallet.adjust' && entry.amount > 0 && entry.at >= since)
          .reduce((sum, entry) => sum + entry.amount, 0);
        return [{ total: String(total) }];
      }
      return [];
    },
  };
  const wallet = {
    get cash() {
      return cash;
    },
    receive: vi.fn(async (amount: number) => {
      cash += amount;
    }),
    pay: vi.fn(async (amount: number) => {
      cash -= amount;
    }),
  };
  const character = { id: 'char-1', handle: 'tolu_b', firstName: 'Tolu', lastName: 'Bakare' };
  const session = {
    run: async (_options: unknown, work: (ctx: unknown) => Promise<unknown>) => work({ manager, wallet, character, notify: () => undefined }),
  } as unknown as CharacterSession;
  const audit = {
    record: vi.fn(async (_manager: unknown, actor: AuditActor, entry: AuditEntryInput) => {
      auditLog.push({ actorUserId: actor.userId, action: entry.action, amount: Number(entry.metadata?.amount ?? 0), at: new Date() });
      return 'a';
    }),
  } as unknown as AuditService;
  const config = { get: (key: keyof AppConfig) => (key === 'adminEmails' ? [OWNER_EMAIL] : undefined) } as unknown as ConfigService<AppConfig, true>;
  const service = new AdminPlayersService({} as DataSource, {} as AccountLifecycleService, session, audit, {} as WorldService, config);
  let keys = 0;
  const adjust = (actor: AuditActor, userId: string, amount: number) =>
    service.adjustWallet(actor, userId, { amount, reason: 'Compensation for a bug', idempotencyKey: `00000000-0000-4000-8000-${String(++keys).padStart(12, '0')}` });
  return { service, adjust, wallet, queries, auditLog };
}

const codeOf = async (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => 'ok',
    (error: unknown) => (error instanceof DomainException ? error.errorCode : `unexpected: ${String(error)}`),
  );

describe('AdminPlayersService wallet adjustments and handle resets', () => {
  const players = [
    account('player-1'),
    account('admin-1', { role: 'admin' }),
    account('admin-2', { role: 'admin' }),
    account('owner-1', { email: OWNER_EMAIL }),
  ];

  it('apply the same who-may-manage rules as suspending: not yourself, not an owner, admins only by an owner', async () => {
    const { adjust, service, wallet } = setup(players);
    expect(await codeOf(adjust(admin, 'admin-1', 5_000))).toBe('FORBIDDEN');
    expect(await codeOf(adjust(admin, 'owner-1', -5_000))).toBe('FORBIDDEN');
    expect(await codeOf(adjust(owner, 'owner-1', 5_000))).toBe('FORBIDDEN');
    expect(await codeOf(adjust(admin, 'admin-2', 5_000))).toBe('FORBIDDEN');
    expect(await codeOf(service.resetHandle(admin, 'admin-1', 'Testing on myself'))).toBe('FORBIDDEN');
    expect(await codeOf(service.resetHandle(admin, 'owner-1', 'Rude handle'))).toBe('FORBIDDEN');
    expect(wallet.receive).not.toHaveBeenCalled();
    expect(wallet.pay).not.toHaveBeenCalled();

    expect(await codeOf(adjust(owner, 'admin-2', 5_000))).toBe('ok');
    expect(await codeOf(adjust(admin, 'player-1', 5_000))).toBe('ok');
    expect(await codeOf(service.resetHandle(admin, 'player-1', 'Offensive handle'))).toBe('ok');
  });

  it('lets only owners credit more than ₦10,000,000 at a time', async () => {
    const { adjust } = setup(players);
    expect(await codeOf(adjust(admin, 'player-1', OWNER_ONLY_CREDIT_ABOVE + 1))).toBe('FORBIDDEN');
    expect(await codeOf(adjust(admin, 'player-1', OWNER_ONLY_CREDIT_ABOVE))).toBe('ok');
    expect(await codeOf(adjust(owner, 'player-1', OWNER_ONLY_CREDIT_ABOVE + 1))).toBe('ok');
  });

  it('caps an admin’s credits at ₦50,000,000 per UTC day in all, under a per-admin lock; debits and owners aren’t capped', async () => {
    const { adjust, queries } = setup(players);
    for (let index = 0; index < ADMIN_DAILY_CREDIT_CAP / OWNER_ONLY_CREDIT_ABOVE; index++) {
      expect(await codeOf(adjust(admin, 'player-1', OWNER_ONLY_CREDIT_ABOVE))).toBe('ok');
    }
    expect(await codeOf(adjust(admin, 'player-1', 1))).toBe('FORBIDDEN');
    // The lock is taken before the day's total is read.
    expect(queries.slice(0, 2)).toEqual(['lock', 'sum']);
    expect(await codeOf(adjust(admin, 'player-1', -1_000))).toBe('ok');
    expect(await codeOf(adjust(owner, 'player-1', OWNER_ONLY_CREDIT_ABOVE * 2))).toBe('ok');
    // Another admin has their own allowance.
    expect(await codeOf(adjust({ ...admin, userId: 'admin-2' }, 'player-1', 1_000))).toBe('ok');
  });
});
