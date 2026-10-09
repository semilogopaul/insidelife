import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Redis } from 'ioredis';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { DomainException } from '../../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../../config/configuration.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { AuditEntryInput } from '../../audit/audit.types.js';
import type { AuthService } from '../../auth/auth.service.js';
import type { UserEntity } from '../../users/entities/user.entity.js';
import type { UsersService } from '../../users/users.service.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { AdminAuthService } from './admin-auth.service.js';
import { ADMIN_AUDIENCE, type AdminKeys } from './admin-keys.js';
import type { AdminMfaEntity } from './entities/admin-mfa.entity.js';
import type { AdminSessionEntity } from './entities/admin-session.entity.js';
import { SecretBox, deriveKey } from './secret-box.js';
import { currentTotp } from './totp.js';

const OWNER = 'owner@insidelife.online';
const user = (overrides: Partial<UserEntity> = {}): UserEntity =>
  ({
    id: 'u-admin',
    email: 'mod@insidelife.online',
    passwordHash: 'x',
    role: 'admin',
    suspendedAt: null,
    deletedAt: null,
    purgedAt: null,
    ...overrides,
  }) as UserEntity;

const meta = { ip: '10.0.0.9', userAgent: 'vitest', traceId: 'trace' };

/** In-memory tables for admin_mfa and admin_sessions, a fake transaction, Redis counters and the audit log. */
function setup(account: UserEntity | null, options: { password?: string } = {}) {
  const password = options.password ?? 'right-password-1';
  const mfaRows = new Map<string, AdminMfaEntity>();
  const sessionRows: AdminSessionEntity[] = [];
  const audits: Array<{ manager: unknown; entry: AuditEntryInput }> = [];
  const counters = new Map<string, number>();

  const findSession = (where: Record<string, unknown> | Array<Record<string, unknown>>): AdminSessionEntity | null => {
    const alternatives = Array.isArray(where) ? where : [where];
    return sessionRows.find((row) => alternatives.some((option) => Object.entries(option).every(([key, value]) => row[key as keyof AdminSessionEntity] === value))) ?? null;
  };
  const manager = {
    findOne: async (entity: { name: string }, { where }: { where: Record<string, unknown> }) =>
      entity.name === 'AdminMfaEntity' ? (mfaRows.get(String(where.userId)) ?? null) : findSession(where),
    save: async (entityOrRow: AdminMfaEntity | AdminSessionEntity) => {
      if ('recoveryCodeHashes' in entityOrRow) mfaRows.set(entityOrRow.userId, entityOrRow);
      else if (!sessionRows.includes(entityOrRow)) sessionRows.push(Object.assign(entityOrRow, { id: `s-${sessionRows.length + 1}` }));
      return entityOrRow;
    },
    create: (_entity: unknown, values: object) => ({ ...values }),
    update: async (_entity: unknown, where: { id: string }, values: Partial<AdminSessionEntity>) => {
      const row = sessionRows.find((candidate) => candidate.id === where.id);
      if (row) Object.assign(row, values);
      return { affected: row ? 1 : 0 };
    },
    getRepository: () => ({
      findOne: async ({ where }: { where: Record<string, unknown> }) => findSession(where),
      save: async (row: AdminSessionEntity) => row,
    }),
  } as unknown as EntityManager;
  const dataSource = { transaction: async (_level: string, work: (m: EntityManager) => Promise<unknown>) => work(manager) } as unknown as DataSource;
  const mfaRepo = {
    findOne: async ({ where }: { where: { userId: string } }) => mfaRows.get(where.userId) ?? null,
    upsert: async (values: Partial<AdminMfaEntity> & { userId: string }) => {
      mfaRows.set(values.userId, { recoveryCodeHashes: [], enabledAt: null, secret: null, lastUsedStep: null, ...mfaRows.get(values.userId), ...values } as AdminMfaEntity);
    },
  } as unknown as Repository<AdminMfaEntity>;
  const sessionsRepo = {
    findOne: async ({ where }: { where: Record<string, unknown> }) => findSession(where),
    findOneByOrFail: async (where: Record<string, unknown>) => findSession(where),
    update: async () => ({ affected: 1 }),
  } as unknown as Repository<AdminSessionEntity>;
  const jwt = new JwtService({
    secret: 'admin-test-key-0123456789abcdef0123456789',
    signOptions: { algorithm: 'HS256', issuer: 'insidelife', audience: ADMIN_AUDIENCE },
    verifyOptions: { algorithms: ['HS256'], issuer: 'insidelife', audience: ADMIN_AUDIENCE },
  });
  const keys: AdminKeys = { mfaBox: new SecretBox(deriveKey('k'.repeat(40), 'mfa')), recoveryKey: deriveKey('k'.repeat(40), 'recovery') };
  const redis = {
    get: async (key: string) => (counters.has(key) ? String(counters.get(key)) : null),
    incr: async (key: string) => {
      counters.set(key, (counters.get(key) ?? 0) + 1);
      return counters.get(key);
    },
    expire: async () => 1,
    ttl: async () => 900,
    del: async (key: string) => counters.delete(key),
  } as unknown as Redis;
  const auth = { checkCredentials: async (_email: string, typed: string) => (account && typed === password ? account : null) } as unknown as AuthService;
  const users = { findById: async () => account, findByEmail: async () => account } as unknown as UsersService;
  const audit = {
    record: vi.fn(async (m: unknown, _actor: unknown, entry: AuditEntryInput) => {
      audits.push({ manager: m, entry });
      return 'a';
    }),
    recordNow: vi.fn(async (_actor: unknown, entry: AuditEntryInput) => {
      audits.push({ manager: null, entry });
      return 'a';
    }),
  } as unknown as AuditService;
  const settings: Partial<AppConfig> = {
    adminEmails: [OWNER],
    admin: { mfaKey: '', accessTtlSeconds: 600, sessionMaxHours: 12, sessionIdleMinutes: 120 },
  };
  const config = { get: (key: keyof AppConfig) => settings[key] } as unknown as ConfigService<AppConfig, true>;
  const service = new AdminAuthService(dataSource, mfaRepo, sessionsRepo, jwt, keys, redis, auth, users, audit, config);
  return { service, jwt, manager, mfaRows, sessionRows, audits, counters };
}

const codeOf = async (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => 'ok',
    (error: unknown) => (error instanceof DomainException ? error.errorCode : `unexpected: ${String(error)}`),
  );

/** Password, then authenticator set-up: returns the session and recovery codes. */
async function enrol(context: ReturnType<typeof setup>) {
  const challenge = await context.service.signIn('mod@insidelife.online', 'right-password-1', meta);
  const secret = challenge.setup?.secret ?? '';
  return { challenge, secret, ...(await context.service.confirmSetup(challenge.challengeToken, await currentTotp(secret), meta)) };
}

describe('AdminAuthService sign-in', () => {
  it('answers non-admins exactly like a wrong password', async () => {
    const player = setup(user({ role: 'player' }));
    expect(await codeOf(player.service.signIn('p@example.com', 'right-password-1', meta))).toBe('INVALID_CREDENTIALS');
    const wrong = setup(user());
    expect(await codeOf(wrong.service.signIn('mod@insidelife.online', 'nope', meta))).toBe('INVALID_CREDENTIALS');
    expect(wrong.audits.map((row) => row.entry.action)).toEqual(['admin.sign-in-failed']);
  });

  it('never issues a session for the password alone: first sign-in must set up an authenticator', async () => {
    const context = setup(user());
    const challenge = await context.service.signIn('mod@insidelife.online', 'right-password-1', meta);
    expect(challenge.stage).toBe('setup');
    expect(challenge.setup?.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(challenge).not.toHaveProperty('accessToken');
    expect(context.sessionRows).toHaveLength(0);
  });

  it('enrols with the first valid code, hands out 10 recovery codes, and audits in the same transaction', async () => {
    const context = setup(user());
    const { issued, recoveryCodes } = await enrol(context);
    expect(recoveryCodes).toHaveLength(10);
    expect(issued.session.admin).toMatchObject({ role: 'admin', recoveryCodesLeft: 10 });
    expect(context.audits.map((row) => row.entry.action)).toEqual(['admin.mfa-enrolled', 'admin.sign-in']);
    expect(context.audits.every((row) => row.manager === context.manager)).toBe(true);
    // The stored secret is encrypted.
    const stored = context.mfaRows.get('u-admin');
    expect(stored?.secret).toMatch(/^v1\./);
    expect(stored?.pendingSecret).toBeNull();
  });

  it('afterwards asks for a code, accepts a recovery code once, and locks after repeated wrong codes', async () => {
    const context = setup(user());
    const { recoveryCodes } = await enrol(context);
    const challenge = await context.service.signIn('mod@insidelife.online', 'right-password-1', meta);
    expect(challenge.stage).toBe('verify');
    expect(challenge.setup).toBeNull();

    const recovery = recoveryCodes[0] ?? '';
    expect(await codeOf(context.service.verify(challenge.challengeToken, { recoveryCode: recovery }, meta))).toBe('ok');
    expect(await codeOf(context.service.verify(challenge.challengeToken, { recoveryCode: recovery }, meta))).toBe('ADMIN_CODE_INVALID');

    for (let attempt = 0; attempt < 4; attempt++) {
      expect(await codeOf(context.service.verify(challenge.challengeToken, { code: '000000' }, meta))).toBe('ADMIN_CODE_INVALID');
    }
    expect(await codeOf(context.service.verify(challenge.challengeToken, { code: '000000' }, meta))).toBe('ADMIN_LOCKED');
  });

  it('refuses a challenge token for the wrong step or one that isn’t a challenge', async () => {
    const context = setup(user());
    const { issued } = await enrol(context);
    expect(await codeOf(context.service.verify(issued.session.accessToken, { code: '123456' }, meta))).toBe('ADMIN_CHALLENGE_EXPIRED');
  });
});

const guardContext = (authorization?: string) => {
  const request: { headers: Record<string, string>; admin?: unknown } = { headers: authorization ? { authorization } : {} };
  return { request, context: { switchToHttp: () => ({ getRequest: () => request }) } as never };
};

describe('AdminAuthGuard', () => {

  it('lets a signed-in admin through and attaches who they are', async () => {
    const context = setup(user({ email: OWNER }));
    const { issued } = await enrol(context);
    const { request, context: execution } = guardContext(`Bearer ${issued.session.accessToken}`);
    expect(await new AdminAuthGuard(context.service).canActivate(execution)).toBe(true);
    expect(request.admin).toMatchObject({ userId: 'u-admin', role: 'owner' });
  });

  it('refuses missing tokens, player tokens and challenge tokens', async () => {
    const context = setup(user());
    const guard = new AdminAuthGuard(context.service);
    expect(await codeOf(guard.canActivate(guardContext().context))).toBe('UNAUTHENTICATED');
    const player = new JwtService({ secret: 'player-key-0123456789abcdef0123456789', signOptions: { issuer: 'insidelife' } });
    const playerToken = await player.signAsync({ sub: 'u-admin', email: 'mod@insidelife.online', role: 'admin' });
    expect(await codeOf(guard.canActivate(guardContext(`Bearer ${playerToken}`).context))).toBe('UNAUTHENTICATED');
    const challenge = await context.service.signIn('mod@insidelife.online', 'right-password-1', meta);
    expect(await codeOf(guard.canActivate(guardContext(`Bearer ${challenge.challengeToken}`).context))).toBe('UNAUTHENTICATED');
  });

  it('refuses a token whose session was revoked or whose account lost admin access', async () => {
    const context = setup(user());
    const { issued } = await enrol(context);
    const header = `Bearer ${issued.session.accessToken}`;
    const session = context.sessionRows[0];
    if (session) session.revokedAt = new Date();
    expect(await codeOf(new AdminAuthGuard(context.service).canActivate(guardContext(header).context))).toBe('UNAUTHENTICATED');

    const demoted = setup(user());
    const second = await enrol(demoted);
    const demotedService = demoted.service as unknown as { users: { findById: () => Promise<UserEntity> } };
    demotedService.users.findById = async () => user({ role: 'player' });
    expect(await codeOf(new AdminAuthGuard(demoted.service).canActivate(guardContext(`Bearer ${second.issued.session.accessToken}`).context))).toBe('ADMIN_ACCESS_REMOVED');
  });
});
