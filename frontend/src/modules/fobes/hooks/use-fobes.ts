'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { FobesListId } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { fobesApi } from '../services/fobes.api';

/** The server caches each list for a minute; so does the client. */
const STALE_MS = 60_000;

export function useFobesList(list: FobesListId, page: number) {
  return useQuery({
    queryKey: queryKeys.domain('fobes', 'list', list, page),
    queryFn: () => fobesApi.list(list, page),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useFobesMe() {
  return useQuery({ queryKey: queryKeys.domain('fobes', 'me'), queryFn: fobesApi.me, staleTime: STALE_MS });
}
