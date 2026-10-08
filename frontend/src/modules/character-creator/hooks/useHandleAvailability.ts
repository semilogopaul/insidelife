'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { queryKeys } from '@/common/api/query-keys';
import { creatorApi } from '../services/creator.api';

export type HandleStatus = 'idle' | 'checking' | 'available' | 'taken' | 'unknown';

const VALID = /^[a-z0-9_]{3,20}$/;

/** Debounced live check of an @handle. Never blocks on network errors (the server validates on submit anyway). */
export function useHandleAvailability(handle: string): HandleStatus {
  const [debounced, setDebounced] = useState(handle);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(handle), 400);
    return () => window.clearTimeout(id);
  }, [handle]);

  const valid = VALID.test(debounced);
  const query = useQuery({
    queryKey: queryKeys.domain('handle-availability', debounced),
    queryFn: () => creatorApi.handleAvailable(debounced),
    enabled: valid,
    staleTime: 30_000,
    retry: false,
  });

  if (!VALID.test(handle)) return 'idle';
  if (handle !== debounced || query.isFetching) return 'checking';
  if (query.isError || !query.data) return 'unknown';
  return query.data.available ? 'available' : 'taken';
}
