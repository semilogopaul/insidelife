import { formatNaira, koboToNaira, type PromotionStatus } from '@insidelife/shared';
import type { DataSource, EntityTarget, FindOptionsWhere } from 'typeorm';
import type { CheckoutRefund, PaidCheckout } from '../../common/ports/checkout.port.js';
import { withTransaction } from '../../database/transaction.js';
import type { ModerationSubjectType } from './entities/moderation-log.entity.js';
import { appendModerationLog } from './moderation-log.js';
import { refundSettlement, type RefundSettlement } from './rules/status.rules.js';

/** The fields a billboard campaign and a club order share for refunds. */
export interface RefundableItem {
  id: string;
  status: PromotionStatus;
  paymentReference: string | null;
  holdExpiresAt: Date | null;
}

export interface AppliedRefund<T extends RefundableItem> {
  readonly item: T;
  readonly settlement: RefundSettlement;
}

const refundLine = (refund: CheckoutRefund): string =>
  `${formatNaira(koboToNaira(refund.amountKobo))} refunded ${refund.source === 'api' ? 'automatically' : 'in the Flutterwave dashboard'} (refund ${refund.refundId})`;

/**
 * Record a refund of an item's payment (the `onRefunded` hook of the billboard and club-play fulfillers): an owed
 * refund moves `refund-due` → `refunded`; a running item refunded from the dashboard is taken down (→ `refund-due` →
 * `refunded`); a refunded duplicate payment is only logged. Row-locked and idempotent: a repeat finds nothing to do.
 */
export async function applyRefundToItem<T extends RefundableItem>(
  dataSource: DataSource,
  target: EntityTarget<T>,
  subjectType: ModerationSubjectType,
  payment: PaidCheckout,
  refund: CheckoutRefund,
): Promise<AppliedRefund<T> | null> {
  return withTransaction(dataSource, async (manager) => {
    const item = await manager.findOne(target, { where: { id: payment.subjectId } as FindOptionsWhere<T>, lock: { mode: 'pessimistic_write' } });
    if (!item) return null;
    const settlement = refundSettlement(item, payment.reference);
    const base = { subjectType, subjectId: item.id, paymentReference: payment.reference };
    switch (settlement.kind) {
      case 'none':
        return { item, settlement };
      case 'duplicate-payment':
        await appendModerationLog(manager, { ...base, action: 'refunded', fromStatus: item.status, toStatus: item.status, reason: `Duplicate payment: ${refundLine(refund)}` });
        return { item, settlement };
      case 'refunded': {
        const from = item.status;
        if (settlement.takenDown) {
          await appendModerationLog(manager, { ...base, action: 'refund-flagged', fromStatus: from, toStatus: 'refund-due', reason: 'Payment refunded in the Flutterwave dashboard; taken down' });
        }
        item.status = 'refunded';
        item.holdExpiresAt = null;
        await manager.save(item);
        await appendModerationLog(manager, { ...base, action: 'refunded', fromStatus: settlement.takenDown ? 'refund-due' : from, toStatus: 'refunded', reason: refundLine(refund) });
        return { item, settlement };
      }
    }
  });
}
