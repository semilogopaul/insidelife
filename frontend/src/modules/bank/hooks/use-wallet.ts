'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { queryKeys } from '@/common/api/query-keys';
import { useSession } from '@/common/auth/session-store';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';
import { bankKeys } from '../services/bank-keys';
import { bankApi } from '../services/bank.api';

/** Balances + transfer limits (server state; the HUD keeps reading the snapshot). */
export function useWallet() {
  const authenticated = useSession((state) => state.status === 'authenticated');
  return useQuery({ queryKey: queryKeys.wallet, queryFn: bankApi.wallet, enabled: authenticated, staleTime: 10_000 });
}

/** Cursor-paginated statement, newest first. */
export function useStatement() {
  const query = useInfiniteQuery({
    queryKey: bankKeys.statement,
    queryFn: ({ pageParam, signal }) => bankApi.statement(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 10_000,
  });
  const entries = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  return { ...query, entries };
}

/** After anything that moves money: refresh the wallet, statement, payments and the character snapshot. */
export function useRefreshMoney(): () => Promise<void> {
  const client = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.wallet }),
      client.invalidateQueries({ queryKey: queryKeys.snapshot }),
      client.invalidateQueries({ queryKey: bankKeys.statement }),
      client.invalidateQueries({ queryKey: bankKeys.payments }),
      client.invalidateQueries({ queryKey: bankKeys.packages }),
    ]);
  }, [client]);
}

/** Keep the open Bank live when money lands from elsewhere (a friend's transfer, salary, a webhook top-up). */
export function useLiveWallet(): void {
  const refresh = useRefreshMoney();
  useRealtimeEvent('character:invalidate', () => void refresh());
}
