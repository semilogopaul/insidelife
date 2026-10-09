import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { ACCOUNT_DELETION_PHRASE, isAccountDeletionPhrase, type AccountDeletionDto, type DeleteAccountRequest } from '@insidelife/shared';
import type { RequestMeta } from '../../common/decorators/request-meta.decorator.js';
import {
  ConflictException,
  ForbiddenActionException,
  GameRuleException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../config/configuration.js';
import { withTransaction } from '../../database/transaction.js';
import { AuditService } from '../audit/audit.service.js';
import { SYSTEM_ACTOR, type AuditAction, type AuditActor } from '../audit/audit.types.js';
import { AuthService } from '../auth/auth.service.js';
import { SessionRevocationService } from '../auth/session-revocation.service.js';
import { CharacterDirectory, characterLabel } from '../characters/character-directory.service.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { accountSnapshot, canRestore, isOwner, restoreDeadline } from './account-status.js';

/** Shown in admin screens and the audit log once an account is anonymised. */
export const PURGED_LABEL = 'Deleted player';
const PURGE_BATCH = 100;

export interface DeletionOptions {
  /** `self`: the player deleted their own account; `admin`: a moderator did. */
  readonly source: 'self' | 'admin';
  readonly reason: string | null;
}

/**
 * Account lifecycle: suspend / lift, soft delete (by the player or an admin) / restore, and the purge that anonymises
 * deleted accounts once the restore window closes. Every change is audited in the same transaction; sessions end
 * immediately (refresh tokens revoked in the transaction, access tokens and sockets cut off after commit).
 */
@Injectable()
export class AccountLifecycleService {
  private readonly logger = new Logger(AccountLifecycleService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly revocations: SessionRevocationService,
    private readonly directory: CharacterDirectory,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Me → Settings → Delete my account: the confirmation phrase and the password, then a soft delete. */
  async deleteOwn(userId: string, request: DeleteAccountRequest, meta: RequestMeta): Promise<AccountDeletionDto> {
    if (!isAccountDeletionPhrase(request.confirmation)) {
      throw new GameRuleException('CONFIRMATION_MISMATCH', `Type ${ACCOUNT_DELETION_PHRASE} to confirm`);
    }
    if (!(await this.auth.verifyPassword(userId, request.password))) {
      throw new GameRuleException('PASSWORD_INCORRECT', 'That password isn’t right');
    }
    const user = await this.dataSource.getRepository(UserEntity).findOne({ where: { id: userId } });
    if (!user) throw new ResourceNotFoundException('Account');
    if (user.role === 'admin' || isOwner(user.email, this.owners())) {
      throw new ForbiddenActionException('Admin accounts can’t be deleted from the game. Remove the admin role first.');
    }
    const actor: AuditActor = { userId, email: user.email, role: 'player', ...meta };
    const deleted = await this.softDelete(actor, userId, { source: 'self', reason: null });
    return {
      deletedAt: (deleted.deletedAt ?? new Date()).toISOString(),
      restorableUntil: (deleted.purgeAfter ?? new Date()).toISOString(),
    };
  }

  async suspend(actor: AuditActor, userId: string, reason: string): Promise<UserEntity> {
    const user = await this.change(actor, userId, 'player.suspend', reason, (target) => {
      if (target.deletedAt) throw new ConflictException('ACCOUNT_DELETED', 'This account is deleted. Restore it before suspending it');
      if (target.suspendedAt) throw new ConflictException('ALREADY_SUSPENDED', 'This account is already suspended');
      target.suspendedAt = new Date();
      target.suspensionReason = reason.trim().slice(0, 500);
      target.suspendedBy = actor.userId;
      return true;
    });
    await this.revocations.cutOff(userId);
    return user;
  }

  async unsuspend(actor: AuditActor, userId: string, reason: string): Promise<UserEntity> {
    return this.change(actor, userId, 'player.unsuspend', reason, (target) => {
      if (!target.suspendedAt) throw new ConflictException('NOT_SUSPENDED', 'This account isn’t suspended');
      target.suspendedAt = null;
      target.suspensionReason = null;
      target.suspendedBy = null;
      return false;
    });
  }

  /** Soft delete: sign-in refused, character hidden, email and handle reserved, ledger and payments kept. */
  async softDelete(actor: AuditActor, userId: string, options: DeletionOptions): Promise<UserEntity> {
    const action: AuditAction = options.source === 'self' ? 'account.delete' : 'player.delete';
    const user = await this.change(actor, userId, action, options.reason, async (target, manager) => {
      if (target.deletedAt) throw new ConflictException('ALREADY_DELETED', 'This account is already deleted');
      const now = new Date();
      target.deletedAt = now;
      target.deletedBy = options.source === 'admin' ? actor.userId : null;
      target.purgeAfter = restoreDeadline(now, this.restoreWindowDays());
      await this.directory.setHiddenForUser(manager, target.id, now);
      return true;
    });
    await this.revocations.cutOff(userId);
    return user;
  }

  /** Undo a soft delete within the restore window. The player signs in again as before. */
  async restore(actor: AuditActor, userId: string, reason: string): Promise<UserEntity> {
    return this.change(actor, userId, 'player.restore', reason, async (target, manager) => {
      if (!target.deletedAt) throw new ConflictException('NOT_DELETED', 'This account isn’t deleted');
      if (!canRestore(target, new Date())) {
        throw new ConflictException('RESTORE_WINDOW_PASSED', 'The restore window for this account has passed');
      }
      target.deletedAt = null;
      target.deletedBy = null;
      target.purgeAfter = null;
      await this.directory.setHiddenForUser(manager, target.id, null);
      return false;
    });
  }

  /**
   * Anonymise deleted accounts whose restore window has closed (run hourly by the purge job). Removes the email,
   * password, date of birth, names and handle, friendships, blocks, notifications and refresh tokens; scrubs the
   * player's identity from past audit entries. Keeps ledger, payments, promotions and reports (accounting, disputes,
   * safety), which only point at the account's id. Returns how many accounts were purged.
   */
  async purgeDue(now = new Date()): Promise<number> {
    const due = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM users WHERE deleted_at IS NOT NULL AND purged_at IS NULL AND purge_after <= $1 ORDER BY purge_after LIMIT ${PURGE_BATCH}`,
      [now],
    );
    let purged = 0;
    for (const { id } of due) {
      try {
        if (await this.purgeOne(id, now)) purged++;
      } catch (error) {
        this.logger.error({ err: error, userId: id }, 'Account purge failed');
      }
    }
    if (purged > 0) this.logger.log({ purged }, 'Deleted accounts anonymised');
    return purged;
  }

  private async purgeOne(userId: string, now: Date): Promise<boolean> {
    return withTransaction(this.dataSource, async (manager) => {
      const user = await manager.findOne(UserEntity, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user?.deletedAt || user.purgedAt || !user.purgeAfter || user.purgeAfter.getTime() > now.getTime()) return false;
      const before = accountSnapshot(user);
      const characters = `SELECT id FROM characters WHERE user_id = $1`;
      await manager.query(`DELETE FROM social_friendships WHERE requester_id IN (${characters}) OR addressee_id IN (${characters})`, [userId]);
      await manager.query(`DELETE FROM social_blocks WHERE blocker_id IN (${characters}) OR blocked_id IN (${characters})`, [userId]);
      await manager.query(`DELETE FROM notifications WHERE character_id IN (${characters})`, [userId]);
      await manager.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
      await manager.query(
        `UPDATE characters
            SET handle = 'gone_' || substr(replace(id::text, '-', ''), 1, 12),
                first_name = 'Former', last_name = 'player',
                died_at = CASE WHEN alive THEN settled_at ELSE died_at END,
                cause_of_death = CASE WHEN alive THEN 'Account deleted' ELSE cause_of_death END,
                alive = false,
                hidden_at = COALESCE(hidden_at, now())
          WHERE user_id = $1`,
        [userId],
      );
      user.email = `deleted-${user.id}@deleted.invalid`;
      user.passwordHash = '!purged';
      user.birthDate = null;
      user.emailVerifiedAt = null;
      user.suspensionReason = null;
      user.purgedAt = now;
      await manager.save(user);
      await this.audit.scrubPlayer(manager, userId, PURGED_LABEL);
      await this.audit.record(manager, SYSTEM_ACTOR, {
        action: 'player.purge',
        target: { type: 'player', id: userId, label: PURGED_LABEL },
        before: { status: before.status, purgedAt: null },
        after: { status: 'purged', purgedAt: now },
        reason: 'Restore window ended',
      });
      return true;
    });
  }

  /**
   * Lock the account, apply `mutate` (returns true when sessions must end), save, revoke refresh tokens when asked,
   * and write the audit entry, all in one transaction.
   */
  private async change(
    actor: AuditActor,
    userId: string,
    action: AuditAction,
    reason: string | null,
    mutate: (user: UserEntity, manager: EntityManager) => boolean | Promise<boolean>,
  ): Promise<UserEntity> {
    return withTransaction(this.dataSource, async (manager) => {
      const user = await manager.findOne(UserEntity, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!user || user.purgedAt) throw new ResourceNotFoundException('Account');
      if (actor.role !== 'player') this.assertMayManage(actor, user);
      const before = accountSnapshot(user);
      const endSessions = await mutate(user, manager);
      await manager.save(user);
      const sessionsEnded = endSessions ? await this.revocations.revokeRefreshTokens(manager, user.id) : 0;
      await this.audit.record(manager, actor, {
        action,
        target: { type: 'player', id: user.id, label: await this.labelOf(user, manager) },
        before,
        after: accountSnapshot(user),
        reason,
        metadata: endSessions ? { sessionsEnded } : undefined,
      });
      return user;
    });
  }

  /** Admins can't act on their own account or an owner's; only owners can act on other admins. */
  private assertMayManage(actor: AuditActor, user: UserEntity): void {
    if (actor.userId === user.id) throw new ForbiddenActionException('You can’t do that to your own account');
    if (isOwner(user.email, this.owners())) throw new ForbiddenActionException('Owner accounts (ADMIN_EMAILS) can’t be changed from the portal');
    if (user.role === 'admin' && actor.role !== 'owner') throw new ForbiddenActionException('Only an owner can do that to another admin');
  }

  private async labelOf(user: UserEntity, manager: EntityManager): Promise<string> {
    const character = await this.directory.findLatestByUser(user.id, manager);
    return character ? characterLabel(character) : user.email;
  }

  private owners(): readonly string[] {
    return this.config.get('adminEmails', { infer: true });
  }

  private restoreWindowDays(): number {
    return this.config.get('accounts', { infer: true }).restoreWindowDays;
  }
}
