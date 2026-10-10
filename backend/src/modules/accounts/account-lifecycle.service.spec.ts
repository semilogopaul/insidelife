import type { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainException } from '../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../config/configuration.js';
import type { AuditService } from '../audit/audit.service.js';
import type { AuditActor, AuditEntryInput } from '../audit/audit.types.js';
import type { AuthService } from '../auth/auth.service.js';
import type { SessionRevocationService } from '../auth/session-revocation.service.js';
import type { CharacterDirectory } from '../characters/character-directory.service.js';
import type { UserEntity } from '../users/entities/user.entity.js';
import { AccountLifecycleService } from './account-lifecycle.service.js';

const OWNER = 'owner@insidelife.online';

const baseUser = (overrides: Partial<UserEntity> = {}): UserEntity => ({
  id: 'player-1',
  email: 'tolu@example.com',
  passwordHash: 'hash',
  emailVerifiedAt: null,
  birthDate: '2000-01-01',
  termsAcceptedAt: null,
  termsVersion: null,
  role: 'player',
  lastLoginAt: null,
  suspendedAt: null,
  suspensionReason: null,
  suspendedBy: null,
  deletedAt: null,
  deletedBy: null,
  purgeAfter: null,
  purgedAt: null,
  welcomeSeenAt: null,
  welcomeReaction: null,
  featuredSeenAt: null,
  tourCompletedAt: null,
  tourSkipped: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const admin: AuditActor = { userId: 'admin-1', email: 'mod@insidelife.online', role: 'admin', ip: '10.0.0.1', userAgent: 'test', traceId: 'trace-1' };
const owner: AuditActor = { ...admin, userId: 'owner-1', email: OWNER, role: 'owner' };

/**
 * A fake database with one transaction at a time: `transaction(work)` hands `work` a manager, and the test can see
 * which manager every write used. A throw inside `work` is a rollback (the saved user is discarded).
 */
function setup(user: UserEntity) {
  let committed: UserEntity = { ...user };
  const events: string[] = [];
  const managers = new Set<EntityManager>();
  const dataSource = {
    transaction: async (_level: string, work: (manager: EntityManager) => Promise<unknown>) => {
      let working: UserEntity = { ...committed };
      const manager = {
        findOne: async () => ({ ...working }),
        save: async (entity: UserEntity) => {
          events.push('save-user');
          working = { ...entity };
          return entity;
        },
      } as unknown as EntityManager;
      managers.add(manager);
      const result = await work(manager);
      committed = working;
      events.push('commit');
      return result;
    },
    getRepository: () => ({ findOne: async () => ({ ...committed }) }),
  } as unknown as DataSource;

  const audit = {
    record: vi.fn(async (manager: EntityManager, _actor: AuditActor, entry: AuditEntryInput) => {
      expect(managers.has(manager)).toBe(true);
      events.push(`audit:${entry.action}`);
      return 'audit-1';
    }),
  };
  const revocations = {
    revokeRefreshTokens: vi.fn(async (manager: EntityManager) => {
      expect(managers.has(manager)).toBe(true);
      events.push('revoke-refresh');
      return 2;
    }),
    cutOff: vi.fn(async () => {
      events.push('cut-off');
    }),
  };
  const directory = {
    setHiddenForUser: vi.fn(async (manager: EntityManager, _userId: string, hiddenAt: Date | null) => {
      expect(managers.has(manager)).toBe(true);
      events.push(hiddenAt ? 'hide-character' : 'show-character');
      return 1;
    }),
    findLatestByUser: async () => ({ handle: 'tolu_b', firstName: 'Tolu', lastName: 'Bakare' }),
  };
  const auth = { verifyPassword: vi.fn(async (_id: string, password: string) => password === 'right-password-1') };
  const settings: Partial<AppConfig> = { adminEmails: [OWNER], accounts: { restoreWindowDays: 30 } };
  const config = { get: (key: keyof AppConfig) => settings[key] } as unknown as ConfigService<AppConfig, true>;
  const service = new AccountLifecycleService(
    dataSource,
    audit as unknown as AuditService,
    auth as unknown as AuthService,
    revocations as unknown as SessionRevocationService,
    directory as unknown as CharacterDirectory,
    config,
  );
  return { service, audit, revocations, directory, auth, events, committed: () => committed };
}

const codeOf = async (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => 'ok',
    (error: unknown) => (error instanceof DomainException ? error.errorCode : `unexpected: ${String(error)}`),
  );

describe('AccountLifecycleService', () => {
  beforeEach(() => vi.useRealTimers());

  it('suspends with the audit entry and refresh-token revocation in the same transaction, then cuts sessions off', async () => {
    const { service, events, audit, committed } = setup(baseUser());
    await service.suspend(admin, 'player-1', 'Scamming other players');
    expect(events).toEqual(['save-user', 'revoke-refresh', 'audit:player.suspend', 'commit', 'cut-off']);
    expect(committed().suspendedAt).toBeInstanceOf(Date);
    const entry = audit.record.mock.calls[0]?.[2];
    expect(entry).toMatchObject({
      action: 'player.suspend',
      target: { type: 'player', id: 'player-1', label: '@tolu_b (Tolu Bakare)' },
      reason: 'Scamming other players',
      before: { status: 'active' },
      after: { status: 'suspended' },
      metadata: { sessionsEnded: 2 },
    });
    expect(audit.record.mock.calls[0]?.[1]).toBe(admin);
  });

  it('rolls the change back when the audit entry can’t be written (and ends no sessions)', async () => {
    const { service, audit, revocations, committed } = setup(baseUser());
    audit.record.mockRejectedValueOnce(new DomainException('DB_DOWN', 'audit insert failed'));
    expect(await codeOf(service.suspend(admin, 'player-1', 'Scamming other players'))).toBe('DB_DOWN');
    expect(committed().suspendedAt).toBeNull();
    expect(revocations.cutOff).not.toHaveBeenCalled();
  });

  it('lifts a suspension without ending sessions', async () => {
    const { service, events } = setup(baseUser({ suspendedAt: new Date(), suspensionReason: 'x' }));
    await service.unsuspend(admin, 'player-1', 'Appeal accepted');
    expect(events).toEqual(['save-user', 'audit:player.unsuspend', 'commit']);
  });

  it('lets a player delete their own account: phrase, password, hidden character, restore window', async () => {
    const { service, events, audit, committed } = setup(baseUser());
    const meta = { ip: '1.2.3.4', userAgent: 'phone', traceId: 't' };
    expect(await codeOf(service.deleteOwn('player-1', { password: 'right-password-1', confirmation: 'delete account' }, meta))).toBe('CONFIRMATION_MISMATCH');
    expect(await codeOf(service.deleteOwn('player-1', { password: 'wrong', confirmation: 'DELETE MY ACCOUNT' }, meta))).toBe('PASSWORD_INCORRECT');
    const result = await service.deleteOwn('player-1', { password: 'right-password-1', confirmation: ' delete my account ' }, meta);
    expect(events).toEqual(['hide-character', 'save-user', 'revoke-refresh', 'audit:account.delete', 'commit', 'cut-off']);
    const days = (Date.parse(result.restorableUntil) - Date.parse(result.deletedAt)) / 86_400_000;
    expect(days).toBe(30);
    expect(committed().deletedBy).toBeNull();
    expect(audit.record.mock.calls[0]?.[1]).toMatchObject({ userId: 'player-1', email: 'tolu@example.com', role: 'player', ip: '1.2.3.4' });
  });

  it('restores within the window and refuses after it', async () => {
    const deletedAt = new Date(Date.now() - 5 * 86_400_000);
    const recent = setup(baseUser({ deletedAt, purgeAfter: new Date(deletedAt.getTime() + 30 * 86_400_000) }));
    await recent.service.restore(admin, 'player-1', 'Player asked by email');
    expect(recent.events).toEqual(['show-character', 'save-user', 'audit:player.restore', 'commit']);
    expect(recent.committed().deletedAt).toBeNull();

    const old = setup(baseUser({ deletedAt: new Date(Date.now() - 40 * 86_400_000), purgeAfter: new Date(Date.now() - 86_400_000) }));
    expect(await codeOf(old.service.restore(admin, 'player-1', 'Too late'))).toBe('RESTORE_WINDOW_PASSED');
  });

  it('protects admins’ own accounts, owners and other admins', async () => {
    expect(await codeOf(setup(baseUser({ id: 'admin-1' })).service.suspend(admin, 'admin-1', 'Testing myself'))).toBe('FORBIDDEN');
    expect(await codeOf(setup(baseUser({ email: OWNER })).service.softDelete(admin, 'player-1', { source: 'admin', reason: 'nope' }))).toBe('FORBIDDEN');
    expect(await codeOf(setup(baseUser({ role: 'admin' })).service.suspend(admin, 'player-1', 'Rogue moderator'))).toBe('FORBIDDEN');
    expect(await codeOf(setup(baseUser({ role: 'admin' })).service.suspend(owner, 'player-1', 'Rogue moderator'))).toBe('ok');
    expect(await codeOf(setup(baseUser({ role: 'admin' })).service.deleteOwn('player-1', { password: 'right-password-1', confirmation: 'DELETE MY ACCOUNT' }, { ip: null, userAgent: null, traceId: null }))).toBe('FORBIDDEN');
  });
});
