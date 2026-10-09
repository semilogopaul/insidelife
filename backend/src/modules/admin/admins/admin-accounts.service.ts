import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { ConflictException, ForbiddenActionException, ResourceNotFoundException } from '../../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../../config/configuration.js';
import { withTransaction } from '../../../database/transaction.js';
import { accountStatus, isOwner, type AccountStatus } from '../../accounts/account-status.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuditAction, AuditActor } from '../../audit/audit.types.js';
import { UserEntity } from '../../users/entities/user.entity.js';
import { AdminAuthService } from '../auth/admin-auth.service.js';

export interface AdminAccountDto {
  readonly userId: string | null;
  readonly email: string;
  /** `owner`: listed in ADMIN_EMAILS (change it in the server's environment). `granted`: given the role here. */
  readonly source: 'owner' | 'granted';
  /** Null when an ADMIN_EMAILS address has no account yet (sign up in the game first). */
  readonly status: AccountStatus | null;
  readonly mfaEnabledAt: string | null;
  readonly recoveryCodesLeft: number;
  readonly lastSignInAt: string | null;
  readonly activeSessions: number;
  readonly createdAt: string | null;
}

interface AdminRow {
  readonly id: string;
  readonly email: string;
  readonly role: string;
  readonly suspended_at: Date | null;
  readonly deleted_at: Date | null;
  readonly purged_at: Date | null;
  readonly created_at: Date;
  readonly enabled_at: Date | null;
  readonly recovery_left: number | null;
  readonly last_sign_in: Date | null;
  readonly active_sessions: string;
}

/**
 * Admin accounts. Owners (ADMIN_EMAILS) can grant the admin role to an existing account, remove it, reset someone's
 * authenticator, and sign an admin out everywhere; any admin can sign themselves out everywhere. All audited.
 */
@Injectable()
export class AdminAccountsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly adminAuth: AdminAuthService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async list(): Promise<readonly AdminAccountDto[]> {
    const owners = this.owners();
    const rows = await this.dataSource.query<AdminRow[]>(
      `SELECT u.id, u.email, u.role, u.suspended_at, u.deleted_at, u.purged_at, u.created_at, m.enabled_at,
              jsonb_array_length(m.recovery_code_hashes) AS recovery_left,
              (SELECT max(s.created_at) FROM admin_sessions s WHERE s.user_id = u.id) AS last_sign_in,
              (SELECT count(*) FROM admin_sessions s
                WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.idle_expires_at > now() AND s.absolute_expires_at > now()) AS active_sessions
         FROM users u
         LEFT JOIN admin_mfa m ON m.user_id = u.id
        WHERE u.role = 'admin' OR u.email = ANY($1)
        ORDER BY (u.email = ANY($1)) DESC, u.email`,
      [owners],
    );
    const accounts: AdminAccountDto[] = rows.map((row) => ({
      userId: row.id,
      email: row.email,
      source: owners.includes(row.email) ? 'owner' : 'granted',
      status: accountStatus({ suspendedAt: row.suspended_at, deletedAt: row.deleted_at, purgedAt: row.purged_at }),
      mfaEnabledAt: row.enabled_at?.toISOString() ?? null,
      recoveryCodesLeft: row.recovery_left ?? 0,
      lastSignInAt: row.last_sign_in?.toISOString() ?? null,
      activeSessions: Number(row.active_sessions),
      createdAt: row.created_at.toISOString(),
    }));
    const withAccounts = new Set(rows.map((row) => row.email));
    for (const email of owners) {
      if (withAccounts.has(email)) continue;
      accounts.push({ userId: null, email, source: 'owner', status: null, mfaEnabledAt: null, recoveryCodesLeft: 0, lastSignInAt: null, activeSessions: 0, createdAt: null });
    }
    return accounts;
  }

  /** Give the admin role to an existing account (it sets up an authenticator at its first portal sign-in). */
  async grant(actor: AuditActor, email: string, reason: string): Promise<readonly AdminAccountDto[]> {
    this.requireOwner(actor);
    await withTransaction(this.dataSource, async (manager) => {
      const user = await manager.findOne(UserEntity, { where: { email: email.trim().toLowerCase() }, lock: { mode: 'pessimistic_write' } });
      if (!user || user.purgedAt) throw new ResourceNotFoundException('An account with that email');
      if (user.deletedAt || user.suspendedAt) throw new ConflictException('ACCOUNT_NOT_ACTIVE', 'That account is suspended or deleted');
      if (user.role === 'admin' || isOwner(user.email, this.owners())) throw new ConflictException('ALREADY_ADMIN', 'That account is already an admin');
      user.role = 'admin';
      await manager.save(user);
      await this.record(manager, actor, 'admin.grant', user, { role: 'player' }, { role: 'admin' }, reason);
    });
    return this.list();
  }

  /** Remove the admin role: sessions end and the authenticator is forgotten. */
  async revoke(actor: AuditActor, userId: string, reason: string): Promise<readonly AdminAccountDto[]> {
    this.requireOwner(actor);
    await withTransaction(this.dataSource, async (manager) => {
      const user = await this.lockAdmin(manager, userId);
      if (isOwner(user.email, this.owners())) throw new ForbiddenActionException('Owners are set by ADMIN_EMAILS on the server; remove the address there');
      user.role = 'player';
      await manager.save(user);
      const sessions = await this.adminAuth.revokeSessions(manager, user.id, 'role-removed');
      await this.adminAuth.resetMfa(manager, user.id);
      await this.record(manager, actor, 'admin.revoke', user, { role: 'admin' }, { role: 'player' }, reason, { sessionsEnded: sessions });
    });
    return this.list();
  }

  /** Forget an admin's authenticator (lost phone): they set it up again at their next sign-in. */
  async resetMfa(actor: AuditActor, userId: string, reason: string): Promise<readonly AdminAccountDto[]> {
    this.requireOwner(actor);
    await withTransaction(this.dataSource, async (manager) => {
      const user = await this.lockAdmin(manager, userId);
      const hadMfa = await this.adminAuth.resetMfa(manager, user.id);
      const sessions = await this.adminAuth.revokeSessions(manager, user.id, 'mfa-reset');
      await this.record(manager, actor, 'admin.mfa-reset', user, { mfaEnabled: hadMfa }, { mfaEnabled: false }, reason, { sessionsEnded: sessions });
    });
    return this.list();
  }

  /** End every admin session of an account (owners: anyone; admins: themselves). */
  async signOutEverywhere(actor: AuditActor, userId: string, reason: string): Promise<readonly AdminAccountDto[]> {
    if (actor.userId !== userId) this.requireOwner(actor);
    await withTransaction(this.dataSource, async (manager) => {
      const user = await this.lockAdmin(manager, userId);
      const sessions = await this.adminAuth.revokeSessions(manager, user.id, actor.userId === userId ? 'sign-out-everywhere' : 'revoked-by-owner');
      await this.record(manager, actor, 'admin.sessions-revoked', user, { activeSessions: sessions }, { activeSessions: 0 }, reason);
    });
    return this.list();
  }

  private async lockAdmin(manager: EntityManager, userId: string): Promise<UserEntity> {
    const user = await manager.findOne(UserEntity, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
    if (!user || (user.role !== 'admin' && !isOwner(user.email, this.owners()))) throw new ResourceNotFoundException('Admin');
    return user;
  }

  private async record(
    manager: EntityManager,
    actor: AuditActor,
    action: AuditAction,
    user: UserEntity,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    reason: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record(manager, actor, { action, target: { type: 'admin', id: user.id, label: user.email }, before, after, reason, metadata });
  }

  private requireOwner(actor: AuditActor): void {
    if (actor.role !== 'owner') throw new ForbiddenActionException('Only an owner (ADMIN_EMAILS) can manage admins');
  }

  private owners(): string[] {
    return [...this.config.get('adminEmails', { infer: true })];
  }
}
