import type {
  CreateDepositRequest,
  DepositDto,
  DepositWithdrawalResultDto,
  FxOrderRequest,
  FxResultDto,
  MarketsDto,
  PlaceOrderRequest,
  PortfolioDto,
  PriceHistoryDto,
  TradeDto,
  TradeResultDto,
} from '@insidelife/shared';
import { api } from '@/common/api/http';
import { queryKeys } from '@/common/api/query-keys';

export const investApi = {
  portfolio: () => api.get<PortfolioDto>('/portfolio'),
  markets: () => api.get<MarketsDto>('/markets'),
  history: (instrumentId: string, days: number) => api.get<PriceHistoryDto>(`/markets/${encodeURIComponent(instrumentId)}/history`, { query: { days } }),
  trades: () => api.get<TradeDto[]>('/investments/orders', { query: { limit: 20 } }),
  placeOrder: (body: PlaceOrderRequest) => api.post<TradeResultDto>('/investments/orders', body),
  openDeposit: (body: CreateDepositRequest) => api.post<DepositDto>('/investments/deposits', body),
  withdrawDeposit: (id: string) => api.post<DepositWithdrawalResultDto>(`/investments/deposits/${encodeURIComponent(id)}/withdrawal`),
  fx: (body: FxOrderRequest) => api.post<FxResultDto>('/fx/orders', body),
};

export const investKeys = {
  portfolio: queryKeys.domain('invest', 'portfolio'),
  markets: queryKeys.domain('invest', 'markets'),
  trades: queryKeys.domain('invest', 'trades'),
  history: (instrumentId: string, days: number) => queryKeys.domain('invest', 'history', instrumentId, days),
} as const;
