import type {
  CreateTopupRequest,
  LedgerEntryDto,
  Paginated,
  PaymentDto,
  PaymentVerificationDto,
  PlayerProfileDto,
  PlayerSearchResultDto,
  SavingsTransferRequest,
  TopupCatalogDto,
  TopupStartedDto,
  TransferRequest,
  TransferResultDto,
  WalletDto,
} from '@insidelife/shared';
import { api } from '@/common/api/http';

export const STATEMENT_PAGE_SIZE = 30;

/** Every Bank endpoint (wallet, transfers, players lookup for the recipient card, payments). */
export const bankApi = {
  wallet: () => api.get<WalletDto>('/wallet'),
  statement: (cursor: string | null, signal?: AbortSignal) =>
    api.get<Paginated<LedgerEntryDto>>('/wallet/statement', { query: { cursor: cursor ?? undefined, limit: STATEMENT_PAGE_SIZE }, signal }),
  moveSavings: (body: SavingsTransferRequest) => api.post<WalletDto>('/wallet/savings-transfers', body),
  transfer: (body: TransferRequest) => api.post<TransferResultDto>('/transfers', body),

  searchPlayers: (query: string, signal?: AbortSignal) => api.get<PlayerSearchResultDto>('/players', { query: { query }, signal }),
  player: (handle: string) => api.get<PlayerProfileDto>(`/players/${encodeURIComponent(handle)}`),

  packages: () => api.get<TopupCatalogDto>('/payments/packages'),
  payments: () => api.get<PaymentDto[]>('/payments'),
  /** A pack (`{ packageId }`) or any whole-naira amount (`{ amountNgn }`); the server quotes the rate. */
  startTopup: (body: CreateTopupRequest) => api.post<TopupStartedDto>('/payments/topups', body),
  /** `transactionId`: Flutterwave's `transaction_id` from the redirect (a hint; the server reads the charge back itself). */
  verify: (reference: string, transactionId?: string) =>
    api.post<PaymentVerificationDto>(`/payments/${encodeURIComponent(reference)}/verification`, transactionId ? { transactionId } : {}),
  sandbox: (reference: string, outcome: 'succeed' | 'fail') => api.post<PaymentVerificationDto>(`/payments/sandbox/${encodeURIComponent(reference)}/${outcome}`),
};
