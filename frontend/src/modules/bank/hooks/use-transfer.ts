'use client';

import { useMutation } from '@tanstack/react-query';
import type { TransferRequest } from '@insidelife/shared';
import { gameEvents } from '@/common/game/game-events';
import { bankApi } from '../services/bank.api';
import { useRefreshMoney } from './use-wallet';

/** Send money. The caller owns the idempotency key so a retry of the same intent can never send twice. */
export function useTransfer() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: (request: TransferRequest) => bankApi.transfer(request),
    onSuccess: () => {
      gameEvents.emit('sfx', { id: 'cash-out' });
      void refresh();
    },
    onError: () => gameEvents.emit('sfx', { id: 'ui-error' }),
  });
}
