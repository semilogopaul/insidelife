'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { CreateDepositRequest, FxOrderRequest, PlaceOrderRequest } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { useSession } from '@/common/auth/session-store';
import { gameEvents } from '@/common/game/game-events';
import { investApi, investKeys } from '../services/invest.api';

export function usePortfolio() {
  const authenticated = useSession((state) => state.status === 'authenticated');
  return useQuery({ queryKey: investKeys.portfolio, queryFn: investApi.portfolio, enabled: authenticated, staleTime: 15_000 });
}

/** Prices move once per game day; refresh every minute while the app is open. */
export function useMarkets() {
  return useQuery({ queryKey: investKeys.markets, queryFn: investApi.markets, staleTime: 30_000, refetchInterval: 60_000 });
}

export function usePriceHistory(instrumentId: string, days: number) {
  return useQuery({
    queryKey: investKeys.history(instrumentId, days),
    queryFn: () => investApi.history(instrumentId, days),
    staleTime: 60_000,
    placeholderData: (previous) => (previous?.instrumentId === instrumentId ? previous : undefined),
  });
}

export function useTrades() {
  return useQuery({ queryKey: investKeys.trades, queryFn: investApi.trades, staleTime: 15_000 });
}

/** After any investment: portfolio, trades, wallet and the snapshot (cash shown on the HUD). */
function useRefreshInvestments(): () => void {
  const client = useQueryClient();
  return useCallback(() => {
    for (const key of [investKeys.portfolio, investKeys.trades, queryKeys.wallet, queryKeys.snapshot, queryKeys.domain('bank')]) {
      void client.invalidateQueries({ queryKey: key });
    }
  }, [client]);
}

function useInvestMutation<TVariables, TResult>(mutationFn: (variables: TVariables) => Promise<TResult>) {
  const refresh = useRefreshInvestments();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      gameEvents.emit('sfx', { id: 'cash-out' });
      refresh();
    },
    onError: () => gameEvents.emit('sfx', { id: 'ui-error' }),
  });
}

export const usePlaceOrder = () => useInvestMutation((body: PlaceOrderRequest) => investApi.placeOrder(body));
export const useOpenDeposit = () => useInvestMutation((body: CreateDepositRequest) => investApi.openDeposit(body));
export const useWithdrawDeposit = () => useInvestMutation((id: string) => investApi.withdrawDeposit(id));
export const useFxOrder = () => useInvestMutation((body: FxOrderRequest) => investApi.fx(body));
