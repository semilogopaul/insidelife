'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { CreateTopupRequest } from '@insidelife/shared';
import { gameEvents } from '@/common/game/game-events';
import { useSession } from '@/common/auth/session-store';
import { bankKeys } from '../services/bank-keys';
import { bankApi } from '../services/bank.api';
import { useRefreshMoney } from './use-wallet';

export function useTopupCatalog() {
  return useQuery({ queryKey: bankKeys.packages, queryFn: bankApi.packages, staleTime: 15_000 });
}

export function usePaymentHistory() {
  const authenticated = useSession((state) => state.status === 'authenticated');
  return useQuery({ queryKey: bankKeys.payments, queryFn: bankApi.payments, enabled: authenticated, staleTime: 10_000 });
}

/** Start a Flutterwave checkout and leave for it. The browser comes back to /payments/callback. */
export function useStartTopup() {
  return useMutation({
    mutationFn: (body: CreateTopupRequest) => bankApi.startTopup(body),
    onSuccess: (started) => {
      gameEvents.emit('sfx', { id: 'ui-click' });
      window.location.assign(started.authorizationUrl);
    },
    onError: () => gameEvents.emit('sfx', { id: 'ui-error' }),
  });
}

/** Ask the server to confirm a payment with Flutterwave (idempotent; delivers if paid). */
export function useVerifyPayment() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: (reference: string) => bankApi.verify(reference),
    onSuccess: (result) => {
      if (result.fulfilledNow) gameEvents.emit('sfx', { id: 'cash-in' });
      void refresh();
    },
  });
}
