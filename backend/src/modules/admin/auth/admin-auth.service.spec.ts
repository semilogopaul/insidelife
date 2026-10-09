import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Redis } from 'ioredis';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomainException } from '../../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../../config/configuration.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { AuditActor, AuditEntryInput } from '../../audit/audit.types.js';
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
    emailVerifiedAt: null,
    suspendedAt: null,
    deletedAt: null,
    purgedAt: null,
    ...overrides,
  }) as UserEntity;

const meta = { ip: '10.0.0.9', userAgent: 'vitest', traceId: 'trace' };

interface AuditRow {
  readonly actor: AuditActor;
  readonly entry: AuditEntryInput;
  readonly inTransaction: boolean;
}

/** The admin_mfa and admin_sessions tables and the audit log, as one committed state. */
interface Tables {
  mfa: Map<string, AdminMfaEntity>;
  sessions: AdminSessionEntity[];
  audits: AuditRow[];
}

const findSession = (sessions: readonly AdminSessionEntity[], where: Record<string, unknown> | Array<Record<string, unknown>>) => {
  const alternatives = Array.isArray(where) ? where : [where];
  return sessions.find((row) => alternatives.some((option) => Object.entries(option).every(([key, value]) => row[key as keyof AdminSessionEntity] === value))) ?? null;
};

const copyTables = (tables: Tables): Tables => ({
  mfa: new Map([...tables.mfa].map(([key, row]) => [key, structuredClone(row)])),
  sessions: tables.sessions.map((row) => structuredClone(row)),
  audits: [...tables.audits],
});

/**
 * In-memory tables with real transaction semantics: each transaction works on a copy that replaces the committed
 * state only if the work finishes; a throw discards everything it wrote (audit entries included), like a Postgres
 * rollback. Plus Redis counters (with MULTI) and the user account (mutable, so a test can demote or suspend it).
 */
function setup(account: UserEntity | null, options: { password?: string; deployment?: 'local' | 'public' } = {}) {
  const password = options.password ?? 'right-password-1';
  let committed: Tables = { mfa: new Map(), sessions: [], audits: [] };
  const counters = new Map<string, number>();
  const stateOf = new WeakMap<object, Tables>();

  const managerOver = (state: Tables): EntityManager => {
    const manager = {
      findOne: async (entity: { name: string }, { where }: { where: Record<string, unknown> }) => {
        if (entity.name === 'AdminMfaEntity') return state.mfa.get(String(where.userId)) ?? null;
        if (entity.name === 'UserEntity') return account && where.id === account.id ? account : null;
        return findSession(state.sessions, where);
      },
      save: async (row: AdminMfaEntity | AdminSessionEntity) => {
        if ('recoveryCodeHashes' in row) state.mfa.set(row.userId, row);
        else if (!state.sessions.includes(row)) state.sessions.push(Object.assign(row, { id: `s-${state.sessions.length + 1}` }));
        return row;
      },
      create: (_entity: unknown, values: object) => ({ ...values }),
      update: async (_entity: unknown, where: { id: string }, values: Partial<AdminSessionEntity>) => {
        const row = state.sessions.find((candidate) => candidate.id === where.id);
        if (row) Object.assign(row, values);
        return { affected: row ? 1 : 0 };
      },
      getRepository: () => ({
        findOne: async ({ where }: { where: Record<string, unknown> }) => findSession(state.sessions, where),
        save: async (row: AdminSessionEntity) => row,
      }),
    };
    stateOf.set(manager, state);
    return manager as unknown as EntityManager;
  };
  const dataSource = {
    transaction: async (_level: string, work: (manager: EntityManager) => Promise<unknown>) => {
      const working = copyTables(committed);
      const result = await work(managerOver(working));
      committed = working;
      return result;
    },
  } as unknown as DataSource;
  const mfaRepo = {
    findOne: async ({ where }: { where: { userId: string } }) => committed.mfa.get(where.userId) ?? null,
    upsert: async (values: Partial<AdminMfaEntity> & { userId: string }) => {
      committed.mfa.set(values.userId, { recoveryCodeHashes: [], enabledAt: null, secret: null, lastUsedStep: null, ...committed.mfa.get(values.userId), ...values } as AdminMfaEntity);
    },
  } as unknown as Repository<AdminMfaEntity>;
  const sessionsRepo = {
    findOne: async ({ where }: { where: Record<string, unknown> }) => findSession(committed.sessions, where),
    findOneByOrFail: async (where: Record<string, unknown>) => findSession(committed.sessions, where),
    update: async () => ({ affected: 1 }),
  } as unknown as Repository<AdminSessionEntity>;
  const jwt = new JwtService({
    secret: 'admin-test-key-0123456789abcdef0123456789',
    signOptions: { algorithm: 'HS256', issuer: 'insidelife', audience: ADMIN_AUDIENCE },
    verifyOptions: { algorithms: ['HS256'], issuer: 'insidelife', audience: ADMIN_AUDIENCE },
  });
  const keys: AdminKeys = { mfaBox: new SecretBox(deriveKey('k'.repeat(40), 'mfa')), recoveryKey: deriveKey('k'.repeat(40), 'recovery') };
  const incr = (key: string): number => {
    counters.set(key, (counters.get(key) ?? 0) + 1);
    return counters.get(key) ?? 0;
  };
  const redis = {
    // MULTI: each command runs as it is queued (one JS turn, so atomic like Redis), replies come back on exec.
    multi: () => {
      const replies: Array<[null, unknown]> = [];
      const chain = {
        incr: (key: string) => {
          replies.push([null, incr(key)]);
          return chain;
        },
        expire: () => {
          replies.push([null, 1]);
          return chain;
        },
        exec: async () => replies,
      };
      return chain;
    },
    ttl: async () => 900,
    del: async (key: string) => counters.delete(key),
  } as unknown as Redis;
  const checkCredentials = vi.fn(async (_email: string, typed: string) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return account && typed === password ? account : null;
  });
  const auth = { checkCredentials } as unknown as AuthService;
  const users = { findById: async () => account, findByEmail: async () => account } as unknown as UsersService;
  const audit = {
    record: vi.fn(async (manager: object, actor: AuditActor, entry: AuditEntryInput) => {
      const state = stateOf.get(manager);
      if (!state) throw new Error('audit.record outside a transaction');
      state.audits.push({ actor, entry, inTransaction: true });
      return 'a';
    }),
    recordNow: vi.fn(async (actor: AuditActor, entry: AuditEntryInput) => {
      committed.audits.push({ actor, entry, inTransaction: false });
      return 'a';
    }),
  } as unknown as AuditService;
  const settings: Partial<AppConfig> = {
    adminEmails: [OWNER],
    deployment: options.deployment ?? 'local',
    admin: { mfaKey: '', accessTtlSeconds: 600, sessionMaxHours: 12, sessionIdleMinutes: 120 },
  };
  const config = { get: (key: keyof AppConfig) => settings[key] } as unknown as ConfigService<AppConfig, true>;
  const service = new AdminAuthService(dataSource, mfaRepo, sessionsRepo, jwt, keys, redis, auth, users, audit, config);
  return {
    service,
    account,
    checkCredentials,
    sessions: () => committed.sessions,
    mfa: () => committed.mfa,
    audits: () => committed.audits,
  };
}

const codeOf = async (promise: Promise<unknown>): Promise<string> =>
  promise.then(
    () => 'ok',
    (error: unknown) => (error instanceof DomainException ? error.errorCode : `unexpected: ${String(error)}`),
  );

/** Password, then authenticator set-up: returns the session and recovery codes. */
async function enrol(context: ReturnType<typeof setup>, email = 'mod@insidelife.online') {
  const challenge = await context.service.signIn(email, 'right-password-1', meta);
  const secret = challenge.setup?.secret ?? '';
  return { challenge, secret, ...(await context.service.confirmSetup(challenge.challengeToken, await currentTotp(secret), meta)) };
}

afterEach(() => vi.useRealTimers());

describe('AdminAuthService sign-in', () => {
  it('answers non-admins exactly like a wrong password, and records failures as anonymous against the admin', async () => {
    const player = setup(user({ role: 'player' }));
    expect(await codeOf(player.service.signIn('p@example.com', 'right-password-1', meta))).toBe('INVALID_CREDENTIALS');
    expect(player.audits()).toHaveLength(0);
    const wrong = setup(user());
    expect(await codeOf(wrong.service.signIn('mod@insidelife.online', 'nope', meta))).toBe('INVALID_CREDENTIALS');
    expect(wrong.audits().map((row) => row.entry.action)).toEqual(['admin.sign-in-failed']);
    expect(wrong.audits()[0]?.actor).toMatchObject({ userId: null, email: null, role: 'anonymous', ip: '10.0.0.9' });
    expect(wrong.audits()[0]?.entry.target).toEqual({ type: 'admin', id: 'u-admin', label: 'mod@insidelife.online' });
  });

  it('never issues a session for the password alone: first sign-in must set up an authenticator', async () => {
    const context = setup(user());
    const challenge = await context.service.signIn('mod@insidelife.online', 'right-password-1', meta);
    expect(challenge.stage).toBe('setup');
    expect(challenge.setup?.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(challenge).not.toHaveProperty('accessToken');
    expect(context.sessions()).toHaveLength(0);
  });

  it('enrols with the first valid code, hands out 10 recovery codes, and audits in the same transaction', async () => {
    const context = setup(user());
    const { issued, recoveryCodes } = await enrol(context);
    expect(recoveryCodes).toHaveLength(10);
    expect(issued.session.admin).toMatchObject({ role: 'admin', recoveryCodesLeft: 10 });
    expect(context.audits().map((row) => row.entry.action)).toEqual(['admin.mfa-enrolled', 'admin.sign-in']);
    expect(context.audits().every((row) => row.inTransaction)).toBe(true);
    // The stored secret is encrypted.
    const stored = context.mfa().get('u-admin');
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
    expect(context.audits().filter((row) => row.entry.action === 'admin.sign-in-failed').every((row) => row.actor.role === 'anonymous')).toBe(true);
  });

  it('refuses a challenge token for the wrong step or one that isn’t a challenge', async () => {
    const context = setup(user());
    const { issued } = await enrol(context);
    expect(await codeOf(context.service.verify(issued.session.accessToken, { code: '123456' }, meta))).toBe('ADMIN_CHALLENGE_EXPIRED');
  });
});

describe('AdminAuthService lockout', () => {
  it('counts each attempt before checking it, so parallel guesses can’t pass the cap', async () => {
    const context = setup(user());
    const results = await Promise.all(Array.from({ length: 8 }, () => codeOf(context.service.signIn('mod@insidelife.online', 'wrong', meta))));
    expect(context.checkCredentials).toHaveBeenCalledTimes(5);
    expect(results.filter((code) => code === 'INVALID_CREDENTIALS')).toHaveLength(5);
    expect(results.filter((code) => code === 'ADMIN_LOCKED')).toHaveLength(3);
  });

  it('locks the password step per email and IP: guessing from elsewhere doesn’t lock the admin out', async () => {
    const context = setup(user());
    for (let attempt = 0; attempt < 6; attempt++) await codeOf(context.service.signIn('mod@insidelife.online', 'wrong', { ...meta, ip: '203.0.113.7' }));
    expect(await codeOf(context.service.signIn('mod@insidelife.online', 'right-password-1', { ...meta, ip: '203.0.113.7' }))).toBe('ADMIN_LOCKED');
    expect(await codeOf(context.service.signIn('mod@insidelife.online', 'right-password-1', meta))).toBe('ok');
  });
});

describe('AdminAuthService on the live site (DEPLOYMENT=public)', () => {
  it('only counts a verified email as an admin; the person with the password is told to confirm it', async () => {
    const unverified = setup(user({ email: OWNER, role: 'player' }), { deployment: 'public' });
    expect(await codeOf(unverified.service.signIn(OWNER, 'right-password-1', meta))).toBe('FORBIDDEN');
    expect(await codeOf(unverified.service.signIn(OWNER, 'wrong-password', meta))).toBe('INVALID_CREDENTIALS');
    expect(unverified.service.roleOf(user({ email: OWNER }))).toBeNull();

    const verified = setup(user({ email: OWNER, role: 'player', emailVerifiedAt: new Date() }), { deployment: 'public' });
    expect((await verified.service.signIn(OWNER, 'right-password-1', meta)).stage).toBe('setup');

    // Locally (no mail server needed) an unverified owner still works.
    expect(setup(user()).service.roleOf(user({ email: OWNER }))).toBe('owner');
  });

  it('a non-admin’s right password still gets the generic answer', async () => {
    const player = setup(user({ role: 'player' }), { deployment: 'public' });
    expect(await codeOf(player.service.signIn('mod@insidelife.online', 'right-password-1', meta))).toBe('INVALID_CREDENTIALS');
  });
});

describe('AdminAuthService refresh', () => {
  it('rotates the refresh token', async () => {
    const context = setup(user());
    const { issued } = await enrol(context);
    const next = await context.service.refresh(issued.refreshToken, meta);
    expect(next.refreshToken).not.toBe(issued.refreshToken);
    expect(await codeOf(context.service.refresh(next.refreshToken, meta))).toBe('ok');
  });

  it('a rotated token presented after the grace ends the session for good: the revocation commits', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const context = setup(user());
    const { issued } = await enrol(context);
    const rotated = await context.service.refresh(issued.refreshToken, meta);
    vi.setSystemTime(Date.now() + 31_000);

    expect(await codeOf(context.service.refresh(issued.refreshToken, { ...meta, ip: '198.51.100.4' }))).toBe('UNAUTHENTICATED');
    // The session is revoked in the committed state, so the current token (held by whoever stole it, or the admin)
    // no longer works either, and the reuse is in the audit log.
    expect(context.sessions()[0]).toMatchObject({ revokedReason: 'reuse' });
    expect(await codeOf(context.service.refresh(rotated.refreshToken, meta))).toBe('UNAUTHENTICATED');
    const reuse = context.audits().find((row) => row.entry.action === 'admin.refresh-token-reused');
    expect(reuse?.actor).toMatchObject({ role: 'anonymous', ip: '198.51.100.4' });
    expect(reuse?.entry.target).toMatchObject({ type: 'admin', id: 'u-admin' });
  });

  it('ends the session (committed) when the account lost admin access', async () => {
    const context = setup(user());
    const { issued } = await enrol(context);
    Object.assign(context.account ?? {}, { role: 'player' });
    expect(await codeOf(context.service.refresh(issued.refreshToken, meta))).toBe('ADMIN_ACCESS_REMOVED');
    expect(context.sessions()[0]).toMatchObject({ revokedReason: 'role-removed' });
    // Getting the role back doesn't revive that session.
    Object.assign(context.account ?? {}, { role: 'admin' });
    expect(await codeOf(context.service.refresh(issued.refreshToken, meta))).toBe('UNAUTHENTICATED');
  });

  it('refuses a suspended admin at refresh', async () => {
    const context = setup(user());
    const { issued } = await enrol(context);
    Object.assign(context.account ?? {}, { suspendedAt: new Date() });
    expect(await codeOf(context.service.refresh(issued.refreshToken, meta))).toBe('ADMIN_ACCESS_REMOVED');
  });
});

const guardContext = (authorization?: string) => {
  const request: { headers: Record<string, string>; admin?: unknown } = { headers: authorization ? { authorization } : {} };
  return { request, context: { switchToHttp: () => ({ getRequest: () => request }) } as never };
};

describe('AdminAuthGuard', () => {
  it('lets a signed-in admin through and attaches who they are', async () => {
    const context = setup(user({ email: OWNER }));
    const { issued } = await enrol(context, OWNER);
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
    const session = context.sessions()[0];
    if (session) session.revokedAt = new Date();
    expect(await codeOf(new AdminAuthGuard(context.service).canActivate(guardContext(header).context))).toBe('UNAUTHENTICATED');

    const demoted = setup(user());
    const second = await enrol(demoted);
    Object.assign(demoted.account ?? {}, { role: 'player' });
    expect(await codeOf(new AdminAuthGuard(demoted.service).canActivate(guardContext(`Bearer ${second.issued.session.accessToken}`).context))).toBe('ADMIN_ACCESS_REMOVED');
  });
});
