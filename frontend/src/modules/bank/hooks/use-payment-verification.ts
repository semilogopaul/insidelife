'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys } from '@/common/api/query-keys';
import { bankApi } from '../services/bank.api';
import { paymentOutcome } from '../services/payment-status';
import { useRefreshMoney } from './use-wallet';

const POLL_MS = 3_000;
/** Give Paystack ~30 s to confirm slow channels (bank transfer, USSD) before asking the player to check later. */
const MAX_POLLS = 10;

/**
 * Verifies a returning checkout. Idempotent on the server (verifying twice never credits twice), so it's modelled as
 * a query: StrictMode double-mounts and reloads are harmless. Polls while the bank hasn't confirmed yet.
 */
export function usePaymentVerification(reference: string, enabled: boolean) {
  const refresh = useRefreshMoney();
  const client = useQueryClient();
  const key = queryKeys.domain('bank', 'verification', reference);
  const query = useQuery({
    queryKey: key,
    queryFn: () => bankApi.verify(reference),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
    refetchInterval: (current) => {
      const data = current.state.data;
      if (!data || current.state.dataUpdateCount >= MAX_POLLS) return false;
      const outcome = paymentOutcome(data.payment);
      return outcome === 'pending' || outcome === 'delivering' ? POLL_MS : false;
    },
  });

  const outcome = query.data ? paymentOutcome(query.data.payment) : null;
  useEffect(() => {
    if (outcome === 'delivered') void refresh();
  }, [outcome, refresh]);

  // Re-read on every render: each poll result re-renders this hook.
  const exhausted = (client.getQueryState(key)?.dataUpdateCount ?? 0) >= MAX_POLLS;
  const checkAgain = (): void => {
    void client.resetQueries({ queryKey: key });
  };
  return { ...query, outcome, exhausted, checkAgain };
}
