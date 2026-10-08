'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { bankKeys } from '../services/bank-keys';
import { bankApi } from '../services/bank.api';
import { isValidHandle, normaliseHandle } from '../services/handles';

/** Debounce a fast-changing value (typing) before it drives a request. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Suggestions while typing a name or @handle (2+ characters). */
export function usePlayerSearch(input: string) {
  const query = useDebounced(normaliseHandle(input), 250);
  return useQuery({
    queryKey: bankKeys.playerSearch(query),
    queryFn: ({ signal }) => bankApi.searchPlayers(query, signal),
    enabled: query.length >= 2,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

/** The recipient card: public profile by exact handle. */
export function useRecipient(handle: string | null) {
  const normalised = handle ? normaliseHandle(handle) : '';
  return useQuery({
    queryKey: bankKeys.player(normalised),
    queryFn: () => bankApi.player(normalised),
    enabled: isValidHandle(normalised),
    staleTime: 60_000,
  });
}
