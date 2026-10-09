/** `owner` = an address in ADMIN_EMAILS; `admin` = granted the admin role; `system` = a scheduled job. */
export type AuditActorRole = 'owner' | 'admin' | 'player' | 'system';

/** `ad-rate`: ad prices changed from the portal (written by the ad-rates admin API). */
export const AUDIT_TARGET_TYPES = ['player', 'admin', 'campaign', 'club-order', 'report', 'payment', 'audit-log', 'ad-rate'] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

/** Every action the audit log knows. Dotted: `<subject>.<verb>`. */
export const AUDIT_ACTIONS = [
  // Admin sign-in and security
  'admin.sign-in',
  'admin.sign-in-failed',
  'admin.sign-out',
  'admin.mfa-enrolled',
  'admin.recovery-code-used',
  'admin.recovery-codes-regenerated',
  'admin.mfa-reset',
  'admin.grant',
  'admin.revoke',
  'admin.sessions-revoked',
  // Players
  'player.suspend',
  'player.unsuspend',
  'player.delete',
  'player.restore',
  'player.purge',
  'player.handle-reset',
  'account.delete',
  'wallet.adjust',
  // Moderation
  'campaign.approve',
  'campaign.reject',
  'campaign.mark-refunded',
  'club-order.approve',
  'club-order.reject',
  'club-order.mark-refunded',
  'report.resolve',
  'report.dismiss',
  // Data leaving the system
  'export.players',
  'export.payments',
  'export.moderation',
  'export.reports',
  'export.audit',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** The person (or job) behind an audited change, plus where the request came from. */
export interface AuditActor {
  readonly userId: string | null;
  readonly email: string | null;
  readonly role: AuditActorRole;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly traceId: string | null;
}

export const SYSTEM_ACTOR: AuditActor = { userId: null, email: null, role: 'system', ip: null, userAgent: null, traceId: null };

export interface AuditTarget {
  readonly type: AuditTargetType;
  readonly id: string | null;
  readonly label: string | null;
}

export interface AuditEntryInput {
  readonly action: AuditAction;
  readonly target: AuditTarget;
  /** Full or partial state before the change; only fields that differ from `after` are stored. */
  readonly before?: Readonly<Record<string, unknown>> | null;
  readonly after?: Readonly<Record<string, unknown>> | null;
  readonly reason?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Filters for the audit log list and export. Dates are ISO strings (`from` inclusive, `to` exclusive). */
export interface AuditQuery {
  /** Free text: actor email, target label or id, action, reason, trace id. */
  readonly q?: string;
  readonly actorUserId?: string;
  /** Actor email (partial match). */
  readonly actor?: string;
  /** Exact action, or a prefix ending in `.` (e.g. `player.`). */
  readonly action?: string;
  readonly targetType?: AuditTargetType;
  readonly targetId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly order?: 'asc' | 'desc';
}

export interface AuditEntryDto {
  readonly id: string;
  readonly occurredAt: string;
  readonly actor: { readonly userId: string | null; readonly email: string | null; readonly role: AuditActorRole };
  readonly action: string;
  readonly target: AuditTarget;
  readonly before: Readonly<Record<string, unknown>> | null;
  readonly after: Readonly<Record<string, unknown>> | null;
  readonly reason: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly traceId: string | null;
}
