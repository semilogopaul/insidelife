import type { UserEntity } from '../users/entities/user.entity.js';

/** Where an account stands. `purged` = deleted and anonymised (can't be restored). */
export type AccountStatus = 'active' | 'suspended' | 'deleted' | 'purged';

type StatusFields = Pick<UserEntity, 'suspendedAt' | 'deletedAt' | 'purgedAt'>;

export function accountStatus(user: StatusFields): AccountStatus {
  if (user.purgedAt) return 'purged';
  if (user.deletedAt) return 'deleted';
  if (user.suspendedAt) return 'suspended';
  return 'active';
}

/** The fields an account-status change touches, for the audit log's before/after. */
export function accountSnapshot(
  user: Pick<UserEntity, 'suspendedAt' | 'suspensionReason' | 'deletedAt' | 'purgeAfter' | 'purgedAt' | 'role'>,
): Record<string, unknown> {
  return {
    status: accountStatus(user),
    suspendedAt: user.suspendedAt,
    suspensionReason: user.suspensionReason,
    deletedAt: user.deletedAt,
    restorableUntil: user.purgeAfter,
    purgedAt: user.purgedAt,
    role: user.role,
  };
}

/** A deleted account can come back until the restore window closes (and never after the purge). */
export function canRestore(user: Pick<UserEntity, 'deletedAt' | 'purgeAfter' | 'purgedAt'>, now: Date): boolean {
  return user.deletedAt !== null && user.purgedAt === null && (user.purgeAfter === null || user.purgeAfter.getTime() > now.getTime());
}

/** End of the restore window for an account deleted at `deletedAt`. */
export function restoreDeadline(deletedAt: Date, windowDays: number): Date {
  return new Date(deletedAt.getTime() + windowDays * 86_400_000);
}

/** Owners are the addresses in ADMIN_EMAILS. */
export function isOwner(email: string, ownerEmails: readonly string[]): boolean {
  return ownerEmails.includes(email.trim().toLowerCase());
}
