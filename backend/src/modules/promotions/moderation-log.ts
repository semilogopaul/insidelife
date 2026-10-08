import type { EntityManager } from 'typeorm';
import type { PromotionStatus } from '@insidelife/shared';
import { ModerationLogEntity, type ModerationAction, type ModerationSubjectType } from './entities/moderation-log.entity.js';

export interface ModerationLogEntry {
  readonly subjectType: ModerationSubjectType;
  readonly subjectId: string;
  readonly action: ModerationAction;
  readonly fromStatus: PromotionStatus | null;
  readonly toStatus: PromotionStatus | null;
  readonly actorUserId?: string | null;
  readonly reason?: string | null;
  readonly paymentReference?: string | null;
}

/** Append to the promotions audit trail inside the caller's transaction. */
export async function appendModerationLog(manager: EntityManager, entry: ModerationLogEntry): Promise<void> {
  await manager.insert(ModerationLogEntity, {
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    action: entry.action,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    actorUserId: entry.actorUserId ?? null,
    reason: entry.reason?.slice(0, 300) ?? null,
    paymentReference: entry.paymentReference ?? null,
  });
}
