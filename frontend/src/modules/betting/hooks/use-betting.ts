'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { BetLegRequest, BettingAccountDto, BettingLeagueDto, BetSlipsDto, SelfExclusionDays, UpdateBettingLimitsRequest } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { gameClock } from '@/common/game/game-clock';
import { bettingApi } from '../services/betting.api';

export const bettingKeys = {
  league: queryKeys.domain('betting', 'league'),
  table: queryKeys.domain('betting', 'table'),
  results: (round: number | null) => queryKeys.domain('betting', 'results', round ?? 'latest'),
  account: queryKeys.domain('betting', 'me'),
  slips: queryKeys.domain('betting', 'slips'),
  quote: (legs: readonly BetLegRequest[], stake: number) => queryKeys.domain('betting', 'quote', legs.map((leg) => `${leg.matchId}:${leg.selection}`).join(','), stake),
} as const;

/** Milliseconds until game minute `t` (at least `floor`), for refetching when the board moves on. */
function msUntil(t: number, floor: number): number {
  return Math.max(floor, gameClock.localMsAt(t) - Date.now() + 750);
}

/** The board: refetched just after the next kickoff (the next week opens) and at full time of the live week. */
export function useBettingLeague() {
  return useQuery({
    queryKey: bettingKeys.league,
    queryFn: bettingApi.league,
    staleTime: 5_000,
    refetchInterval: (query) => {
      const data = query.state.data as BettingLeagueDto | undefined;
      const next = data?.upcoming[0]?.kickoffAt;
      return next === undefined ? 15_000 : Math.min(60_000, msUntil(next, 2_000));
    },
  });
}

export function useLeagueTable() {
  return useQuery({ queryKey: bettingKeys.table, queryFn: bettingApi.table, staleTime: 30_000, refetchInterval: 60_000 });
}

export function useRoundResults(round: number | null) {
  return useQuery({ queryKey: bettingKeys.results(round), queryFn: () => bettingApi.results(round), staleTime: 30_000, placeholderData: keepPreviousData });
}

export function useBettingAccount() {
  return useQuery({ queryKey: bettingKeys.account, queryFn: bettingApi.account, staleTime: 10_000, refetchInterval: 60_000 });
}

/** My bets: refetched when the next open slip reaches full time (the server settles it on that read). */
export function useBetSlips() {
  return useQuery({
    queryKey: bettingKeys.slips,
    queryFn: bettingApi.slips,
    staleTime: 5_000,
    refetchInterval: (query) => {
      const data = query.state.data as BetSlipsDto | undefined;
      const due = data?.slips.filter((slip) => slip.status === 'open').map((slip) => slip.settlesAt);
      return due && due.length > 0 ? Math.min(60_000, msUntil(Math.min(...due), 2_000)) : 60_000;
    },
  });
}

/** `value`, once it has stopped changing for `ms` (stake typing shouldn't send a quote per keystroke). */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return settled;
}

/** The server's price for the slip as it stands: total odds, potential returns and why it can't go on (if so). */
export function useSlipQuote(legs: readonly BetLegRequest[], stake: number) {
  const debouncedStake = useDebounced(stake, 300);
  return useQuery({
    queryKey: bettingKeys.quote(legs, debouncedStake),
    queryFn: () => bettingApi.quote(legs, debouncedStake),
    enabled: legs.length > 0,
    staleTime: 2_000,
    placeholderData: keepPreviousData,
  });
}

function useRefreshMoney() {
  const client = useQueryClient();
  return (): void => {
    void client.invalidateQueries({ queryKey: bettingKeys.slips });
    void client.invalidateQueries({ queryKey: bettingKeys.account });
    void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    void client.invalidateQueries({ queryKey: queryKeys.wallet });
  };
}

export function usePlaceBet() {
  const refresh = useRefreshMoney();
  return useMutation({
    mutationFn: ({ legs, stake }: { legs: readonly BetLegRequest[]; stake: number }) => bettingApi.place(legs, stake),
    onSuccess: refresh,
  });
}

function useAccountMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<BettingAccountDto>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (account) => client.setQueryData(bettingKeys.account, account),
  });
}

export function useBettingSettings() {
  return {
    limits: useAccountMutation((request: UpdateBettingLimitsRequest) => bettingApi.limits(request)),
    selfExclude: useAccountMutation((days: SelfExclusionDays) => bettingApi.selfExclude(days)),
    confirmBirthDate: useAccountMutation((birthDate: string) => bettingApi.confirmBirthDate(birthDate)),
  };
}
