'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/common/api/query-keys';
import { epitaphApi } from '../services/epitaph.api';

/** Last life + dynasty history. Works without a living character (the epitaph screen after a death). */
export function useEpitaphData(enabled: boolean) {
  const lastLife = useQuery({ queryKey: queryKeys.domain('epitaph', 'last-life'), queryFn: epitaphApi.lastLife, enabled, staleTime: 0 });
  const legacy = useQuery({ queryKey: queryKeys.domain('epitaph', 'legacy'), queryFn: epitaphApi.legacy, enabled, staleTime: 0 });
  return { lastLife, legacy };
}
