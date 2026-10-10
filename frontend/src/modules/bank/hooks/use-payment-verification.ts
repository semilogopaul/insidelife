'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ApiError } from '@/common/api/api-error';
import { queryKeys } from '@/common/api/query-keys';
import { bankApi } from '../services/bank.api';
import { paymentOutcome } from '../services/payment-status';
import { useRefreshMoney } from './use-wallet';

/** The server asks Flutterwave at most once every 5 s per payment, so polling faster would only re-read our own row. */
const POLL_MS = 5_000;
/** ~40 s of polling covers slow channels (bank transfer, USSD); then the player checks again or leaves it to us. */
const MAX_POLLS = 8;

/** Retrying can't help when we were told to slow down, or the payment isn't on this account. */
const retryable = (error: unknown): boolean => !(error instanceof ApiError && (error.status === 429 || error.status === 404 || error.status === 401));

/**
 * Verifies a returning checkout. Idempotent on the server (verifying twice never credits twice), so it's modelled as
 * a query: StrictMode double-mounts and reloads are harmless. Polls while the bank hasn't confirmed yet; a failed poll
 * keeps the last answer on screen and polling goes on.
 */
export function usePaymentVerification(reference: string, enabled: boolean, transactionId?: string) {
  const refresh = useRefreshMoney();
  const client = useQueryClient();
  const key = queryKeys.domain('bank', 'verification', reference);
  const query = useQuery({
    queryKey: key,
    queryFn: () => bankApi.verify(reference, transactionId),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: (failures, error) => failures < 1 && retryable(error),
    refetchInterval: (current) => {
      const data = current.state.data;
      if (!data || current.state.dataUpdateCount >= MAX_POLLS) return false;
      const outcome = paymentOutcome(data.payment);
      return outcome === 'pending' || outcome === 'delivering' ? POLL_MS : false;
    },
  });

  const outcome = query.data ? paymentOutcome(query.data.payment) : null;
  useEffect(() => {
    if (outcome !== 'delivered') return;
    void refresh();
    // An ad or a club track just paid: Promote's lists are stale too.
    void client.invalidateQueries({ queryKey: queryKeys.domain('promote') });
  }, [outcome, refresh, client]);

  // Re-read on every render: each poll result re-renders this hook.
  const exhausted = (client.getQueryState(key)?.dataUpdateCount ?? 0) >= MAX_POLLS;
  const checkAgain = (): void => {
    void client.resetQueries({ queryKey: key });
  };
  return { ...query, outcome, exhausted, checkAgain };
}
