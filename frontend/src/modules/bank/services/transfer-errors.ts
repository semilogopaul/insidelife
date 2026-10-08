import { ApiError, errorMessage } from '@/common/api/api-error';

/** What the player can do about a failed transfer. */
export type TransferFix = 'edit-amount' | 'change-recipient' | 'retry' | 'top-up' | 'start-over';

export interface TransferFailure {
  readonly title: string;
  readonly body: string;
  readonly fix: TransferFix;
}

/** Server error → plain words + the one thing to do next. Retrying with the same key never sends twice. */
export function describeTransferError(error: unknown, handle: string): TransferFailure {
  const code = error instanceof ApiError ? error.code : 'UNKNOWN';
  const message = errorMessage(error);
  switch (code) {
    case 'DAILY_LIMIT_EXCEEDED':
      return { title: 'Over today’s limit', body: message, fix: 'edit-amount' };
    case 'INSUFFICIENT_FUNDS':
      return { title: 'Not enough money', body: `${message}. Top up, or move money out of savings first.`, fix: 'top-up' };
    case 'TRANSFER_TOO_SMALL':
    case 'TRANSFER_TOO_LARGE':
    case 'INVALID_AMOUNT':
      return { title: 'Check the amount', body: message, fix: 'edit-amount' };
    case 'FORBIDDEN':
      return { title: `You can’t pay @${handle}`, body: 'Transfers are off between you two because one of you blocked the other.', fix: 'change-recipient' };
    case 'SELF_TRANSFER':
    case 'RECIPIENT_DECEASED':
      return { title: 'Choose someone else', body: message, fix: 'change-recipient' };
    case 'RESOURCE_NOT_FOUND':
      return { title: `No player called @${handle}`, body: 'Check the spelling of the handle and try again.', fix: 'change-recipient' };
    case 'RATE_LIMITED':
      return { title: 'Too many transfers at once', body: 'Wait a minute, then try again. Your money hasn’t moved.', fix: 'retry' };
    case 'IDEMPOTENCY_KEY_REUSED':
      return { title: 'Start this transfer again', body: 'Something changed since you confirmed. Nothing was sent.', fix: 'start-over' };
    case 'NETWORK':
      return { title: 'You’re offline', body: 'Check your connection and try again. Retrying is safe: the money can only move once.', fix: 'retry' };
    default:
      return { title: 'Transfer didn’t go through', body: `${message} Retrying is safe: the money can only move once.`, fix: 'retry' };
  }
}
