import type { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import type { JwtService } from '@nestjs/jwt';
import { FindOperator, type Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailVerificationDto } from '@insidelife/shared';
import type { AppConfig } from '../../config/configuration.js';
import { DomainException } from '../../common/exceptions/domain.exception.js';
import type { CharacterDirectory } from '../characters/character-directory.service.js';
import type { UserEntity } from '../users/entities/user.entity.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService, REFRESH_REUSE_GRACE_MS } from './auth.service.js';
import type { EmailVerificationService } from './email-verification.service.js';
import type { RefreshTokenEntity } from './entities/refresh-token.entity.js';

type Row = RefreshTokenEntity;

/** In-memory refresh-token table: equality, IsNull() and MoreThan() in `where`. */
function fakeTokens() {
  const rows: Row[] = [];
  let ids = 0;
  const matches = (row: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, expected]) => {
      const actual = row[key as keyof Row];
      if (expected instanceof FindOperator) {
        if (expected.type === 'isNull') return actual === null;
        if (expected.type === 'moreThan') return actual !== null && actual > (expected.value as Date);
        throw new DomainException('TEST', `unsupported operator ${expected.type}`);
      }
      return actual instanceof Date && expected instanceof Date
        ? actual.getTime() === expected.getTime()
        : actual === expected;
    });
  const repository = {
    create: (values: Partial<Row>) => ({ ...values }) as Row,
    save: async (row: Row) => {
      const saved = { ...row, id: `rt-${++ids}`, createdAt: new Date() };
      rows.push(saved);
      return saved;
    },
    findOne: async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((row) => matches(row, where)) ?? null,
    exists: async ({ where }: { where: Record<string, unknown> }) => rows.some((row) => matches(row, where)),
    update: async (where: Record<string, unknown>, values: Partial<Row>) => {
      for (const row of rows.filter((candidate) => matches(candidate, where))) Object.assign(row, values);
    },
  };
  return { rows, repository: repository as unknown as Repository<RefreshTokenEntity> };
}

const USER: UserEntity = {
  id: 'u1',
  email: 'ada@example.com',
  passwordHash: 'x',
  emailVerifiedAt: null,
  birthDate: '2000-01-01',
  role: 'player',
  lastLoginAt: null,
  suspendedAt: null,
  suspensionReason: null,
  suspendedBy: null,
  deletedAt: null,
  deletedBy: null,
  purgeAfter: null,
  purgedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function setup({ requireEmailVerification = false } = {}) {
  const tokens = fakeTokens();
  const users = {
    record: { ...USER } as UserEntity,
    findById: vi.fn(async (id: string) => (id === users.record.id ? { ...users.record } : null)),
    findByEmail: vi.fn(async () => null),
    create: vi.fn(async (email: string, _hash: string, birthDate: string) => ({
      ...users.record,
      email,
      birthDate,
    })),
    markEmailVerified: vi.fn(async () => {
      users.record = { ...users.record, emailVerifiedAt: new Date() };
    }),
    touchLogin: vi.fn(),
  };
  const jwt = {
    signAsync: vi.fn(async (payload: object) => JSON.stringify(payload)),
  } as unknown as JwtService;
  const settings: Partial<AppConfig> = {
    auth: {
      accessSecret: 'secret',
      accessTtlSeconds: 900,
      refreshTtlDays: 30,
      cookieSecure: false,
      requireEmailVerification,
    },
    adminEmails: [],
  };
  const config = { get: (key: keyof AppConfig) => settings[key] } as unknown as ConfigService<
    AppConfig,
    true
  >;
  const characters = { hasLivingCharacter: async () => false } as unknown as CharacterDirectory;
  const sentStatus: EmailVerificationDto = {
    email: USER.email,
    verified: false,
    available: true,
    codeExpiresAt: 1,
    resendAvailableAt: 1,
  };
  const idleStatus: EmailVerificationDto = { ...sentStatus, codeExpiresAt: null };
  const verification = {
    send: vi.fn(async () => sentStatus),
    status: vi.fn(async () => idleStatus),
    confirm: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };
  const service = new AuthService(
    users as unknown as UsersService,
    jwt,
    config,
    characters,
    verification as unknown as EmailVerificationService,
    tokens.repository,
  );
  // Sessions start in a transaction that reads the account under a lock: the fake reads the current record.
  const manager = { findOne: async () => ({ ...users.record }), getRepository: () => tokens.repository };
  Object.assign(tokens.repository, {
    manager: { connection: { transaction: async (_level: string, work: (m: unknown) => Promise<unknown>) => work(manager) } },
  });
  return { service, tokens, users, verification };
}

const errorOf = async (promise: Promise<unknown>): Promise<DomainException | null> =>
  promise.then(
    () => null,
    (error: unknown) => (error instanceof DomainException ? error : null),
  );

describe('refresh token rotation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('rolls the session: each refresh gets a new 30-day token in the same family', async () => {
    const { service, tokens } = setup();
    const registered = await service.register('ada@example.com', 'secret123', '2000-01-01', 'ua');
    vi.advanceTimersByTime(10 * 60_000);
    const next = await service.refresh(registered.refreshToken, 'ua');
    expect(next.refreshToken).not.toBe(registered.refreshToken);
    expect(next.refreshExpiresAt.getTime()).toBe(Date.now() + 30 * 86_400_000);
    expect(new Set(tokens.rows.map((row) => row.familyId)).size).toBe(1);
    expect(tokens.rows[0]!.revokedAt).not.toBeNull();
    expect(tokens.rows[0]!.replacedById).toBe(tokens.rows[1]!.id);
  });

  it('lets a just-rotated token refresh again within the grace window (two tabs racing)', async () => {
    const { service, tokens } = setup();
    const { refreshToken } = await service.register('ada@example.com', 'secret123', '2000-01-01', 'ua');
    const tabA = await service.refresh(refreshToken, 'ua');
    vi.advanceTimersByTime(REFRESH_REUSE_GRACE_MS - 1_000);
    const tabB = await service.refresh(refreshToken, 'ua');

    expect(tabB.session.accessToken).toBeTruthy();
    expect(new Set(tokens.rows.map((row) => row.familyId)).size).toBe(1);
    // Nobody was signed out: both new tokens keep working.
    expect(await errorOf(service.refresh(tabA.refreshToken, 'ua'))).toBeNull();
    expect(await errorOf(service.refresh(tabB.refreshToken, 'ua'))).toBeNull();
  });

  it('treats reuse after the grace window as theft and ends the whole family', async () => {
    const { service } = setup();
    const { refreshToken } = await service.register('ada@example.com', 'secret123', '2000-01-01', 'ua');
    const rotated = await service.refresh(refreshToken, 'ua');
    vi.advanceTimersByTime(REFRESH_REUSE_GRACE_MS + 1_000);

    expect((await errorOf(service.refresh(refreshToken, 'ua')))?.errorCode).toBe('UNAUTHENTICATED');
    expect((await errorOf(service.refresh(rotated.refreshToken, 'ua')))?.errorCode).toBe('UNAUTHENTICATED');
  });

  it('gives no grace after signing out', async () => {
    const { service } = setup();
    const { refreshToken } = await service.register('ada@example.com', 'secret123', '2000-01-01', 'ua');
    const rotated = await service.refresh(refreshToken, 'ua');
    await service.logout(rotated.refreshToken);
    expect((await errorOf(service.refresh(refreshToken, 'ua')))?.errorCode).toBe('UNAUTHENTICATED');
  });

  it('refuses unknown and expired tokens', async () => {
    const { service } = setup();
    expect((await errorOf(service.refresh('nope', 'ua')))?.errorCode).toBe('UNAUTHENTICATED');
    expect((await errorOf(service.refresh(undefined, 'ua')))?.errorCode).toBe('UNAUTHENTICATED');
    const { refreshToken } = await service.register('ada@example.com', 'secret123', '2000-01-01', 'ua');
    vi.advanceTimersByTime(31 * 86_400_000);
    expect((await errorOf(service.refresh(refreshToken, 'ua')))?.errorCode).toBe('UNAUTHENTICATED');
  });
});

describe('sign-up', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('refuses players under 13 without creating an account', async () => {
    const { service, users } = setup();
    const error = await errorOf(service.register('kid@example.com', 'secret123', '2014-01-01', 'ua'));
    expect(error?.errorCode).toBe('UNDER_MINIMUM_AGE');
    expect(error?.message).toMatch(/13 and over/);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('accepts a player on their 13th birthday', async () => {
    const { service, users } = setup();
    await service.register('teen@example.com', 'secret123', '2013-10-09', 'ua');
    expect(users.create).toHaveBeenCalledWith('teen@example.com', expect.any(String), '2013-10-09');
  });

  it('rejects impossible dates as a validation problem', async () => {
    const { service } = setup();
    expect(
      (await errorOf(service.register('a@example.com', 'secret123', '2027-01-01', 'ua')))?.errorCode,
    ).toBe('VALIDATION_FAILED');
    expect(
      (await errorOf(service.register('a@example.com', 'secret123', '2011-02-30', 'ua')))?.errorCode,
    ).toBe('VALIDATION_FAILED');
  });

  it('with verification optional (the default): sends nothing and lets the new player straight in', async () => {
    const { service, verification } = setup();
    const registered = await service.register('ada@example.com', 'secret123', '2000-01-01', 'ua');
    expect(registered.session.user).toMatchObject({ emailVerified: false, mustVerifyEmail: false });
    expect(verification.send).not.toHaveBeenCalled();
    expect(registered.emailVerification.codeExpiresAt).toBeNull();
  });

  it('with verification required: creates the account unverified and emails the first code', async () => {
    const { service, verification } = setup({ requireEmailVerification: true });
    const registered = await service.register('ada@example.com', 'secret123', '2000-01-01', 'ua');
    expect(registered.session.user).toMatchObject({ emailVerified: false, mustVerifyEmail: true });
    expect(JSON.parse(registered.session.accessToken)).toMatchObject({ ev: false });
    expect(verification.send).toHaveBeenCalledOnce();
    expect(registered.emailVerification.codeExpiresAt).toBe(1);
  });

  it('still signs the player up when the first email fails (they can resend)', async () => {
    const { service, verification } = setup({ requireEmailVerification: true });
    verification.send.mockRejectedValueOnce(new DomainException('EXTERNAL_SERVICE_ERROR', 'down', 502));
    const registered = await service.register('ada@example.com', 'secret123', '2000-01-01', 'ua');
    expect(registered.emailVerification.codeExpiresAt).toBeNull();
    expect(registered.session.accessToken).toBeTruthy();
  });

  it('confirming the email returns a token that is allowed to play', async () => {
    const { service, users, verification } = setup();
    const session = await service.confirmEmail('u1', '123456');
    expect(verification.confirm).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }), '123456');
    expect(users.markEmailVerified).toHaveBeenCalledWith('u1');
    expect(session.user).toMatchObject({ emailVerified: true, mustVerifyEmail: false });
    expect(JSON.parse(session.accessToken)).toMatchObject({ sub: 'u1', ev: true });
  });
});

describe('suspended and deleted accounts', () => {
  const PASSWORD = 'Correct-horse-1';
  let hash = '';
  beforeEach(async () => {
    hash ||= await argon2.hash(PASSWORD);
  });

  function withAccount(overrides: Partial<UserEntity>) {
    const context = setup();
    context.users.record = { ...context.users.record, passwordHash: hash, ...overrides };
    context.users.findByEmail.mockImplementation(async () => ({ ...context.users.record }) as unknown as null);
    return context;
  }

  it('refuses to sign in a deleted account, saying how long it can be restored', async () => {
    const { service } = withAccount({ deletedAt: new Date(), purgeAfter: new Date(Date.now() + 10 * 86_400_000) });
    const error = await errorOf(service.login(USER.email, PASSWORD, 'ua'));
    expect(error?.errorCode).toBe('ACCOUNT_DELETED');
    expect(error?.message).toMatch(/hello@insidelife\.online/);
  });

  it('refuses to sign in a suspended account', async () => {
    const { service } = withAccount({ suspendedAt: new Date() });
    expect((await errorOf(service.login(USER.email, PASSWORD, 'ua')))?.errorCode).toBe('ACCOUNT_SUSPENDED');
  });

  it('never reveals the status to someone without the password', async () => {
    const { service } = withAccount({ deletedAt: new Date() });
    expect((await errorOf(service.login(USER.email, 'wrong-password-1', 'ua')))?.errorCode).toBe('INVALID_CREDENTIALS');
  });

  it('ends existing sessions at the next refresh once the account is suspended or deleted', async () => {
    const context = withAccount({});
    const issued = await context.service.login(USER.email, PASSWORD, 'ua');
    context.users.record = { ...context.users.record, suspendedAt: new Date() };
    expect((await errorOf(context.service.refresh(issued.refreshToken, 'ua')))?.errorCode).toBe('UNAUTHENTICATED');
    expect(context.tokens.rows.every((row) => row.revokedAt !== null)).toBe(true);
  });

  it('keeps a deleted account’s email reserved at sign-up', async () => {
    const { service } = withAccount({ deletedAt: new Date() });
    const error = await errorOf(service.register(USER.email, 'secret123', '2000-01-01', 'ua'));
    expect(error?.errorCode).toBe('EMAIL_TAKEN');
    expect(error?.message).toMatch(/deleted/);
  });
});


describe('a suspension racing a sign-in', () => {
  const PASSWORD = 'Correct-horse-1';
  let hash = '';
  beforeEach(async () => {
    hash ||= await argon2.hash(PASSWORD);
  });

  it('is seen when the refresh token is stored, even after the password check passed', async () => {
    const context = setup();
    context.users.record = { ...context.users.record, passwordHash: hash };
    const active = { ...context.users.record };
    context.users.findByEmail.mockImplementation(async () => active as unknown as null);
    // The suspension commits between the password check and the session insert.
    context.users.record = { ...context.users.record, suspendedAt: new Date() };
    expect((await errorOf(context.service.login(USER.email, PASSWORD, 'ua')))?.errorCode).toBe('ACCOUNT_SUSPENDED');
    expect(context.tokens.rows).toHaveLength(0);
  });

  it('is enforced on the refresh-race path too (a token rotated moments ago)', async () => {
    const context = setup();
    context.users.record = { ...context.users.record, passwordHash: hash };
    context.users.findByEmail.mockImplementation(async () => ({ ...context.users.record }) as unknown as null);
    const first = await context.service.login(USER.email, PASSWORD, 'ua');
    await context.service.refresh(first.refreshToken, 'ua');
    context.users.record = { ...context.users.record, suspendedAt: new Date() };
    // The old token again within the grace: no new session for a suspended account.
    expect((await errorOf(context.service.refresh(first.refreshToken, 'ua')))?.errorCode).toBe('UNAUTHENTICATED');
    expect(context.tokens.rows.every((row) => row.revokedAt !== null)).toBe(true);
  });
});
