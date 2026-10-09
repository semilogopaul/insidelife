import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, type DataSource, type EntityManager, type Repository } from 'typeorm';
import type { RequestMeta } from '../../../common/decorators/request-meta.decorator.js';
import { ConflictException, ForbiddenActionException, InvalidCredentialsException } from '../../../common/exceptions/domain.exception.js';
import { REDIS } from '../../../common/redis/redis.module.js';
import type { AppConfig } from '../../../config/configuration.js';
import { withTransaction } from '../../../database/transaction.js';
import { isOwner } from '../../accounts/account-status.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuditActor } from '../../audit/audit.types.js';
import { AuthService } from '../../auth/auth.service.js';
import { UserEntity } from '../../users/entities/user.entity.js';
import { UsersService } from '../../users/users.service.js';
import type {
  AdminAccessPayload,
  AdminChallengeDto,
  AdminChallengePayload,
  AdminMeDto,
  AdminPrincipal,
  AdminRole,
  AdminSessionDto,
} from '../interfaces/admin-auth.interfaces.js';
import {
  AdminAccessRemovedException,
  AdminChallengeExpiredException,
  AdminCodeInvalidException,
  AdminLockedException,
  AdminSessionEndedException,
} from './admin-auth.errors.js';
import { ADMIN_JWT, ADMIN_KEYS, type AdminKeys } from './admin-keys.js';
import { AdminMfaEntity } from './entities/admin-mfa.entity.js';
import { AdminSessionEntity } from './entities/admin-session.entity.js';
import { findRecoveryCode, hashRecoveryCode, newRecoveryCodes } from './recovery-codes.js';
import { TOTP_ISSUER, checkTotp, newTotpSecret, totpUri } from './totp.js';

export interface IssuedAdminSession {
  readonly session: AdminSessionDto;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
}

export interface IssuedSetup {
  readonly issued: IssuedAdminSession;
  readonly recoveryCodes: readonly string[];
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const CHALLENGE_TTL_SECONDS = 300;
/** A reload during set-up shows the same QR code for this long. */
const PENDING_SECRET_TTL_MS = 15 * 60_000;
/** Two tabs refreshing at once present the same cookie; the second gets a fresh rotation within this window. */
const ROTATION_GRACE_MS = 30_000;
/** Attempts allowed per window: password per (email, IP), codes per account. */
const FAILURE_LIMIT = 5;
const FAILURE_WINDOW_SECONDS = 15 * 60;
const failureKey = (subject: string): string => `admin:auth-failures:${subject}`;

type CodeAttempt = { readonly ok: true; readonly issued: IssuedAdminSession } | { readonly ok: false };
/** A refusal returns (so the session's revocation commits) and is thrown after the transaction. */
type RefreshOutcome = { readonly ok: true; readonly issued: IssuedAdminSession } | { readonly ok: false; readonly ended: 'session' | 'access-removed' };

type RoleFields = Pick<UserEntity, 'email' | 'role' | 'emailVerifiedAt' | 'suspendedAt' | 'deletedAt' | 'purgedAt'>;

/**
 * Admin portal sign-in: password (the account's normal password), then an authenticator-app code. The first sign-in
 * sets the authenticator up and hands out recovery codes. Sessions: a 10-minute admin access token (Bearer) and a
 * rotating refresh cookie, ending after ADMIN_SESSION_IDLE_MINUTES idle or ADMIN_SESSION_MAX_HOURS in all.
 */
@Injectable()
export class AdminAuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AdminMfaEntity) private readonly mfa: Repository<AdminMfaEntity>,
    @InjectRepository(AdminSessionEntity) private readonly sessions: Repository<AdminSessionEntity>,
    @Inject(ADMIN_JWT) private readonly jwt: JwtService,
    @Inject(ADMIN_KEYS) private readonly keys: AdminKeys,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Owner (ADMIN_EMAILS) or granted admin, in good standing; null otherwise. On the live site the email must be
   * verified too: otherwise whoever signed up first with an ADMIN_EMAILS address would be an owner.
   */
  roleOf(user: RoleFields): AdminRole | null {
    if (this.config.get('deployment', { infer: true }) === 'public' && !user.emailVerifiedAt) return null;
    return this.roleIgnoringVerification(user);
  }

  private roleIgnoringVerification(user: RoleFields): AdminRole | null {
    if (user.suspendedAt || user.deletedAt || user.purgedAt) return null;
    if (isOwner(user.email, this.config.get('adminEmails', { infer: true }))) return 'owner';
    return user.role === 'admin' ? 'admin' : null;
  }

  // ----- Sign-in ----------------------------------------------------------------------------------------------------

  async signIn(email: string, password: string, meta: RequestMeta): Promise<AdminChallengeDto> {
    // Counted per email and IP: someone guessing from elsewhere can't lock the real admin out of their account.
    const subject = `password:${email.trim().toLowerCase()}:${meta.ip ?? 'unknown'}`;
    await this.takeAttempt(subject);
    const user = await this.auth.checkCredentials(email, password);
    const role = user ? this.roleOf(user) : null;
    if (!user || !role) {
      await this.recordFailedSignIn(email, 'password', meta);
      // Only someone who knows the password learns this: the address must be confirmed first (live site).
      if (user && this.roleIgnoringVerification(user)) {
        throw new ForbiddenActionException('Confirm your email address in the game first (Me → Settings), then sign in here');
      }
      // Same answer for "wrong password" and "not an admin": the portal never reveals who the admins are.
      throw new InvalidCredentialsException();
    }
    await this.clearAttempts(subject);

    const mfa = await this.mfa.findOne({ where: { userId: user.id } });
    if (mfa?.enabledAt && mfa.secret) return this.challenge(user, 'verify', null);

    let secret: string;
    if (mfa?.pendingSecret && mfa.pendingCreatedAt && Date.now() - mfa.pendingCreatedAt.getTime() < PENDING_SECRET_TTL_MS) {
      secret = this.keys.mfaBox.open(mfa.pendingSecret, user.id);
    } else {
      secret = newTotpSecret();
      await this.mfa.upsert({ userId: user.id, pendingSecret: this.keys.mfaBox.seal(secret, user.id), pendingCreatedAt: new Date() }, ['userId']);
    }
    return this.challenge(user, 'setup', { issuer: TOTP_ISSUER, accountName: user.email, secret, otpauthUrl: totpUri(secret, user.email) });
  }

  /** First sign-in: the first code from the app proves it holds the secret. Returns the session and recovery codes. */
  async confirmSetup(challengeToken: string, code: string, meta: RequestMeta): Promise<IssuedSetup> {
    const { user, role } = await this.challengedAdmin(challengeToken, 'setup');
    await this.takeAttempt(`code:${user.id}`);
    const actor = this.actorOf(user, role, meta);
    const result = await withTransaction(this.dataSource, async (manager) => {
      const mfa = await manager.findOne(AdminMfaEntity, { where: { userId: user.id }, lock: { mode: 'pessimistic_write' } });
      if (mfa?.enabledAt) throw new ConflictException('ADMIN_MFA_ALREADY_SET_UP', 'Your authenticator is already set up. Sign in with a code from it');
      if (!mfa?.pendingSecret) throw new AdminChallengeExpiredException();
      const secret = this.keys.mfaBox.open(mfa.pendingSecret, user.id);
      const step = await checkTotp(secret, code, null);
      if (step === null) return null;
      const recoveryCodes = newRecoveryCodes();
      const now = new Date();
      mfa.secret = this.keys.mfaBox.seal(secret, user.id);
      mfa.pendingSecret = null;
      mfa.pendingCreatedAt = null;
      mfa.enabledAt = now;
      mfa.lastUsedStep = step;
      mfa.recoveryCodeHashes = recoveryCodes.map((recovery) => hashRecoveryCode(this.keys.recoveryKey, recovery));
      mfa.recoveryCodesCreatedAt = now;
      await manager.save(mfa);
      await this.audit.record(manager, actor, {
        action: 'admin.mfa-enrolled',
        target: { type: 'admin', id: user.id, label: user.email },
        before: { mfaEnabled: false },
        after: { mfaEnabled: true },
        metadata: { recoveryCodesIssued: recoveryCodes.length },
      });
      const issued = await this.startSession(manager, user, role, mfa, meta, actor, 'authenticator');
      return { issued, recoveryCodes };
    });
    if (!result) return this.failCode(user, meta);
    await this.clearAttempts(`code:${user.id}`);
    return result;
  }

  /** Every later sign-in: a code from the app, or one of the recovery codes. */
  async verify(challengeToken: string, input: { readonly code?: string; readonly recoveryCode?: string }, meta: RequestMeta): Promise<IssuedAdminSession> {
    const { user, role } = await this.challengedAdmin(challengeToken, 'verify');
    await this.takeAttempt(`code:${user.id}`);
    const actor = this.actorOf(user, role, meta);
    const attempt = await withTransaction(this.dataSource, async (manager): Promise<CodeAttempt> => {
      const mfa = await manager.findOne(AdminMfaEntity, { where: { userId: user.id }, lock: { mode: 'pessimistic_write' } });
      if (!mfa?.enabledAt || !mfa.secret) throw new AdminChallengeExpiredException();
      let method: 'authenticator' | 'recovery-code';
      if (input.recoveryCode) {
        const index = findRecoveryCode(this.keys.recoveryKey, mfa.recoveryCodeHashes, input.recoveryCode);
        if (index < 0) return { ok: false };
        mfa.recoveryCodeHashes = mfa.recoveryCodeHashes.filter((_, i) => i !== index);
        method = 'recovery-code';
      } else {
        const step = await checkTotp(this.keys.mfaBox.open(mfa.secret, user.id), input.code ?? '', mfa.lastUsedStep);
        if (step === null) return { ok: false };
        mfa.lastUsedStep = step;
        method = 'authenticator';
      }
      await manager.save(mfa);
      if (method === 'recovery-code') {
        await this.audit.record(manager, actor, {
          action: 'admin.recovery-code-used',
          target: { type: 'admin', id: user.id, label: user.email },
          metadata: { recoveryCodesLeft: mfa.recoveryCodeHashes.length },
        });
      }
      return { ok: true, issued: await this.startSession(manager, user, role, mfa, meta, actor, method) };
    });
    if (!attempt.ok) return this.failCode(user, meta);
    await this.clearAttempts(`code:${user.id}`);
    return attempt.issued;
  }

  /**
   * Rotate the refresh cookie and mint a new access token. Refusals that end the session (a leaked token presented
   * again, an account that lost admin access) return out of the transaction so the revocation commits, then throw.
   */
  async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<IssuedAdminSession> {
    if (!rawToken) throw new AdminSessionEndedException('Sign in to continue');
    const hash = sha256(rawToken);
    const outcome = await withTransaction(this.dataSource, async (manager): Promise<RefreshOutcome> => {
      const repo = manager.getRepository(AdminSessionEntity);
      let session = await repo.findOne({ where: { tokenHash: hash }, lock: { mode: 'pessimistic_write' } });
      if (!session) {
        const rotated = await repo.findOne({ where: { previousTokenHash: hash }, lock: { mode: 'pessimistic_write' } });
        if (!rotated) return { ok: false, ended: 'session' };
        const withinGrace = rotated.rotatedAt !== null && Date.now() - rotated.rotatedAt.getTime() < ROTATION_GRACE_MS;
        if (!withinGrace) {
          // An old token came back after the grace: it leaked. End the session (and say so in the audit log).
          if (!rotated.revokedAt) {
            await this.endSession(manager, rotated, 'reuse');
            const owner = await manager.findOne(UserEntity, { where: { id: rotated.userId } });
            await this.audit.record(manager, this.anonymousActor(meta), {
              action: 'admin.refresh-token-reused',
              target: { type: 'admin', id: rotated.userId, label: owner?.email ?? null },
              metadata: { sessionId: rotated.id },
            });
          }
          return { ok: false, ended: 'session' };
        }
        session = rotated;
      }
      const now = Date.now();
      if (session.revokedAt || session.idleExpiresAt.getTime() <= now || session.absoluteExpiresAt.getTime() <= now) {
        return { ok: false, ended: 'session' };
      }
      // Read under a share lock: a suspension or role change committing now is either seen here or waits for this.
      const user = await manager.findOne(UserEntity, { where: { id: session.userId }, lock: { mode: 'pessimistic_read' } });
      const role = user ? this.roleOf(user) : null;
      const mfa = await manager.findOne(AdminMfaEntity, { where: { userId: session.userId } });
      if (!user || !role || !mfa?.enabledAt) {
        await this.endSession(manager, session, 'role-removed');
        return { ok: false, ended: 'access-removed' };
      }
      const refreshToken = randomBytes(32).toString('base64url');
      session.previousTokenHash = session.tokenHash;
      session.tokenHash = sha256(refreshToken);
      session.rotatedAt = new Date(now);
      session.idleExpiresAt = this.idleExpiry(now, session.absoluteExpiresAt);
      session.lastSeenAt = new Date(now);
      session.ip = meta.ip;
      session.userAgent = meta.userAgent;
      await repo.save(session);
      return { ok: true, issued: await this.issue(user, role, mfa, session, refreshToken) };
    });
    if (!outcome.ok) throw outcome.ended === 'access-removed' ? new AdminAccessRemovedException() : new AdminSessionEndedException();
    return outcome.issued;
  }

  async signOut(rawToken: string | undefined, meta: RequestMeta): Promise<void> {
    if (!rawToken) return;
    const hash = sha256(rawToken);
    await withTransaction(this.dataSource, async (manager) => {
      const session = await manager.findOne(AdminSessionEntity, { where: [{ tokenHash: hash }, { previousTokenHash: hash }] });
      if (!session || session.revokedAt) return;
      await this.endSession(manager, session, 'sign-out');
      const user = await this.users.findById(session.userId);
      if (!user) return;
      await this.audit.record(manager, this.actorOf(user, this.roleOf(user) ?? 'admin', meta), {
        action: 'admin.sign-out',
        target: { type: 'admin', id: user.id, label: user.email },
        metadata: { sessionId: session.id },
      });
    });
  }

  /** The admin guard: a valid admin token whose session is live, for an account that is still an admin. */
  async authenticate(token: string): Promise<AdminPrincipal> {
    let payload: AdminAccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AdminAccessPayload>(token);
    } catch {
      throw new AdminSessionEndedException('Your admin session expired. Sign in again');
    }
    if (payload.scope !== 'admin' || !payload.amr?.includes('otp')) throw new AdminSessionEndedException();
    const session = await this.sessions.findOne({ where: { id: payload.sid } });
    if (!session || session.userId !== payload.sub || session.revokedAt || session.absoluteExpiresAt.getTime() <= Date.now()) {
      throw new AdminSessionEndedException();
    }
    const user = await this.users.findById(payload.sub);
    const role = user ? this.roleOf(user) : null;
    if (!user || !role) throw new AdminAccessRemovedException();
    if (Date.now() - session.lastSeenAt.getTime() > 60_000) await this.sessions.update({ id: session.id }, { lastSeenAt: new Date() });
    return { userId: user.id, email: user.email, role, sessionId: session.id };
  }

  async me(principal: AdminPrincipal): Promise<AdminMeDto> {
    const [mfa, session] = await Promise.all([
      this.mfa.findOne({ where: { userId: principal.userId } }),
      this.sessions.findOneByOrFail({ id: principal.sessionId }),
    ]);
    return this.meDto(principal, mfa, session);
  }

  /** New recovery codes (the old ones stop working). Needs a current authenticator code. */
  async regenerateRecoveryCodes(principal: AdminPrincipal, code: string, meta: RequestMeta): Promise<readonly string[]> {
    await this.takeAttempt(`code:${principal.userId}`);
    const actor = this.actorFromPrincipal(principal, meta);
    const codes = await withTransaction(this.dataSource, async (manager) => {
      const mfa = await manager.findOne(AdminMfaEntity, { where: { userId: principal.userId }, lock: { mode: 'pessimistic_write' } });
      if (!mfa?.secret) throw new AdminChallengeExpiredException();
      const step = await checkTotp(this.keys.mfaBox.open(mfa.secret, principal.userId), code, mfa.lastUsedStep);
      if (step === null) return null;
      const recoveryCodes = newRecoveryCodes();
      const before = mfa.recoveryCodeHashes.length;
      mfa.lastUsedStep = step;
      mfa.recoveryCodeHashes = recoveryCodes.map((recovery) => hashRecoveryCode(this.keys.recoveryKey, recovery));
      mfa.recoveryCodesCreatedAt = new Date();
      await manager.save(mfa);
      await this.audit.record(manager, actor, {
        action: 'admin.recovery-codes-regenerated',
        target: { type: 'admin', id: principal.userId, label: principal.email },
        before: { recoveryCodesLeft: before },
        after: { recoveryCodesLeft: recoveryCodes.length },
      });
      return recoveryCodes;
    });
    if (!codes) throw new AdminCodeInvalidException();
    await this.clearAttempts(`code:${principal.userId}`);
    return codes;
  }

  // ----- Used by admin management (owners) --------------------------------------------------------------------------

  /** End every live admin session of an account, in the caller's transaction. Returns how many. */
  async revokeSessions(manager: EntityManager, userId: string, reason: string): Promise<number> {
    const result = await manager.update(AdminSessionEntity, { userId, revokedAt: IsNull() }, { revokedAt: new Date(), revokedReason: reason.slice(0, 32) });
    return result.affected ?? 0;
  }

  /** Forget an account's authenticator and recovery codes: it sets them up again at the next sign-in. */
  async resetMfa(manager: EntityManager, userId: string): Promise<boolean> {
    const result = await manager.delete(AdminMfaEntity, { userId });
    return (result.affected ?? 0) > 0;
  }

  actorFromPrincipal(principal: AdminPrincipal, meta: RequestMeta): AuditActor {
    return { userId: principal.userId, email: principal.email, role: principal.role, ...meta };
  }

  // ----- Internals --------------------------------------------------------------------------------------------------

  private async challenge(user: UserEntity, stage: 'setup' | 'verify', setup: AdminChallengeDto['setup']): Promise<AdminChallengeDto> {
    const payload: AdminChallengePayload = { sub: user.id, scope: 'admin-mfa', stage };
    return {
      stage,
      challengeToken: await this.jwt.signAsync(payload, { expiresIn: CHALLENGE_TTL_SECONDS }),
      expiresAt: Date.now() + CHALLENGE_TTL_SECONDS * 1000,
      setup,
    };
  }

  private async challengedAdmin(token: string, stage: 'setup' | 'verify'): Promise<{ user: UserEntity; role: AdminRole }> {
    let payload: AdminChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<AdminChallengePayload>(token);
    } catch {
      throw new AdminChallengeExpiredException();
    }
    if (payload.scope !== 'admin-mfa' || payload.stage !== stage) throw new AdminChallengeExpiredException();
    const user = await this.users.findById(payload.sub);
    const role = user ? this.roleOf(user) : null;
    if (!user || !role) throw new AdminAccessRemovedException();
    return { user, role };
  }

  private async startSession(
    manager: EntityManager,
    user: UserEntity,
    role: AdminRole,
    mfa: AdminMfaEntity,
    meta: RequestMeta,
    actor: AuditActor,
    method: 'authenticator' | 'recovery-code',
  ): Promise<IssuedAdminSession> {
    const refreshToken = randomBytes(32).toString('base64url');
    const now = Date.now();
    const absoluteExpiresAt = new Date(now + this.config.get('admin', { infer: true }).sessionMaxHours * 3_600_000);
    const session = await manager.save(
      manager.create(AdminSessionEntity, {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        previousTokenHash: null,
        rotatedAt: null,
        idleExpiresAt: this.idleExpiry(now, absoluteExpiresAt),
        absoluteExpiresAt,
        revokedAt: null,
        revokedReason: null,
        ip: meta.ip,
        userAgent: meta.userAgent,
        lastSeenAt: new Date(now),
      }),
    );
    await this.audit.record(manager, actor, {
      action: 'admin.sign-in',
      target: { type: 'admin', id: user.id, label: user.email },
      metadata: { method, sessionId: session.id },
    });
    return this.issue(user, role, mfa, session, refreshToken);
  }

  private async issue(user: UserEntity, role: AdminRole, mfa: AdminMfaEntity, session: AdminSessionEntity, refreshToken: string): Promise<IssuedAdminSession> {
    const ttl = this.config.get('admin', { infer: true }).accessTtlSeconds;
    const payload: AdminAccessPayload = { sub: user.id, email: user.email, sid: session.id, scope: 'admin', amr: ['pwd', 'otp'] };
    const principal: AdminPrincipal = { userId: user.id, email: user.email, role, sessionId: session.id };
    return {
      session: {
        accessToken: await this.jwt.signAsync(payload, { expiresIn: ttl }),
        accessTokenExpiresAt: Date.now() + ttl * 1000,
        admin: this.meDto(principal, mfa, session),
      },
      refreshToken,
      refreshExpiresAt: session.idleExpiresAt,
    };
  }

  private meDto(principal: AdminPrincipal, mfa: AdminMfaEntity | null, session: AdminSessionEntity): AdminMeDto {
    return {
      id: principal.userId,
      email: principal.email,
      role: principal.role,
      mfaEnabledAt: mfa?.enabledAt?.toISOString() ?? null,
      recoveryCodesLeft: mfa?.recoveryCodeHashes.length ?? 0,
      sessionId: session.id,
      sessionExpiresAt: session.absoluteExpiresAt.toISOString(),
    };
  }

  private idleExpiry(now: number, absolute: Date): Date {
    const idle = now + this.config.get('admin', { infer: true }).sessionIdleMinutes * 60_000;
    return new Date(Math.min(idle, absolute.getTime()));
  }

  private async endSession(manager: EntityManager, session: AdminSessionEntity, reason: string): Promise<void> {
    await manager.update(AdminSessionEntity, { id: session.id }, { revokedAt: new Date(), revokedReason: reason });
  }

  private actorOf(user: UserEntity, role: AdminRole, meta: RequestMeta): AuditActor {
    return { userId: user.id, email: user.email, role, ...meta };
  }

  /** Someone not signed in: failed sign-in steps are theirs, not the admin's whose account they tried. */
  private anonymousActor(meta: RequestMeta): AuditActor {
    return { userId: null, email: null, role: 'anonymous', ...meta };
  }

  /** Wrong code (the attempt was already counted): audit it, refuse. */
  private async failCode(user: UserEntity, meta: RequestMeta): Promise<never> {
    await this.audit.recordNow(this.anonymousActor(meta), {
      action: 'admin.sign-in-failed',
      target: { type: 'admin', id: user.id, label: user.email },
      metadata: { step: 'code' },
    });
    throw new AdminCodeInvalidException();
  }

  /** Only attempts on real admin accounts are audited (anything else is noise from the internet). */
  private async recordFailedSignIn(email: string, step: 'password', meta: RequestMeta): Promise<void> {
    const account = await this.users.findByEmail(email);
    if (!account) return;
    const owner = isOwner(account.email, this.config.get('adminEmails', { infer: true }));
    if (!owner && account.role !== 'admin') return;
    await this.audit.recordNow(this.anonymousActor(meta), {
      action: 'admin.sign-in-failed',
      target: { type: 'admin', id: account.id, label: account.email },
      metadata: { step },
    });
  }

  /**
   * Count this attempt first, atomically (INCR, and the window's expiry in the same MULTI), then refuse when it is over
   * the cap: parallel attempts each get their own number, so they can't slip past it together. Success clears it.
   */
  private async takeAttempt(subject: string): Promise<void> {
    const key = failureKey(subject);
    const replies = await this.redis.multi().incr(key).expire(key, FAILURE_WINDOW_SECONDS, 'NX').exec();
    const count = Number(replies?.[0]?.[1] ?? 0);
    if (count > FAILURE_LIMIT) {
      const ttl = await this.redis.ttl(key);
      throw new AdminLockedException(Math.max(1, Math.ceil(Math.max(ttl, 60) / 60)));
    }
  }

  private async clearAttempts(subject: string): Promise<void> {
    await this.redis.del(failureKey(subject));
  }
}
