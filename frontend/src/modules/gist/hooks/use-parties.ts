'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePartyRequest, PartyDetailDto, PartyQuoteRequest, SprayRequest } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { gistApi } from '../services/gist.api';
import { gistKeys } from '../services/gist-keys';

export function useParties() {
  return useQuery({ queryKey: gistKeys.parties, queryFn: gistApi.parties, staleTime: 15_000, refetchInterval: 30_000 });
}

export function useParty(id: string | null) {
  return useQuery({ queryKey: gistKeys.party(id ?? ''), queryFn: () => gistApi.party(id ?? ''), enabled: id !== null, staleTime: 5_000, refetchInterval: 20_000 });
}

export function usePartyQuote(request: PartyQuoteRequest | null) {
  const key = request ? `${request.venueId}:${request.tier}:${request.durationHours}:${request.startsInMinutes ?? 0}` : '';
  return useQuery({
    queryKey: gistKeys.quote(key),
    queryFn: () => gistApi.quote(request as PartyQuoteRequest),
    enabled: request !== null,
    staleTime: 30_000,
  });
}

export function useHostParty() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePartyRequest) => gistApi.hostParty(body),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: gistKeys.parties });
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
  });
}

export function useCancelParty() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: gistApi.cancelParty,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: gistKeys.parties });
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
  });
}

export function useAttendParty() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: gistApi.attend,
    onSuccess: (detail: PartyDetailDto) => client.setQueryData(gistKeys.party(detail.id), detail),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: gistKeys.parties });
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
  });
}

export function useSpray(partyId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: SprayRequest) => gistApi.spray(partyId, body),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: gistKeys.party(partyId) });
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
  });
}
