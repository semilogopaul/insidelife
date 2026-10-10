'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTopupRequest } from '@insidelife/shared';
import { gameEvents } from '@/common/game/game-events';
import { useSession } from '@/common/auth/session-store';
import { checkPayment, invalidateAfterPayment } from '@/common/payments';
import { bankKeys } from '../services/bank-keys';
import { bankApi } from '../services/bank.api';

export function useTopupCatalog() {
  return useQuery({ queryKey: bankKeys.packages, queryFn: bankApi.packages, staleTime: 15_000 });
}

export function usePaymentHistory() {
  const authenticated = useSession((state) => state.status === 'authenticated');
  return useQuery({ queryKey: bankKeys.payments, queryFn: bankApi.payments, enabled: authenticated, staleTime: 10_000 });
}

/**
 * Start a Flutterwave checkout and leave for it. The browser comes back to /payments/callback. A refusal re-reads the
 * catalog: the dollar rate may have moved (`RATE_CHANGED`), dollars may be off now (`PAYMENT_CURRENCY_UNAVAILABLE`) or
 * the daily cap used up; the server's message says which.
 */
export function useStartTopup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTopupRequest) => bankApi.startTopup(body),
    onSuccess: (started) => {
      gameEvents.emit('sfx', { id: 'ui-click' });
      window.location.assign(started.authorizationUrl);
    },
    onError: () => {
      gameEvents.emit('sfx', { id: 'ui-error' });
      void client.invalidateQueries({ queryKey: bankKeys.packages });
    },
  });
}

/**
 * "I've paid: check now": ask the server to confirm a payment with Flutterwave (idempotent; delivers at once if paid;
 * safe to press often). Refreshes money, the Bank and Promote (an ad or track may have just been paid).
 */
export function useVerifyPayment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reference: string) => checkPayment(reference),
    onSuccess: (result) => {
      if (result.fulfilledNow) gameEvents.emit('sfx', { id: 'cash-in' });
      void invalidateAfterPayment(client);
    },
  });
}
