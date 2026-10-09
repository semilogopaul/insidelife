'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BlueprintId,
  BuyLandRequest,
  ConstructionPaymentPlan,
  HousingActionResultDto,
  TenancyAction,
} from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { gameEvents } from '@/common/game/game-events';
import { announce, complain } from '@/common/game/feedback';
import { homesApi } from '../services/homes.api';

export const housingKeys = {
  overview: queryKeys.domain('housing'),
  listings: queryKeys.domain('housing', 'listings'),
  land: queryKeys.domain('housing', 'land'),
  houses: queryKeys.domain('housing', 'houses'),
} as const;

/** Milestones worth a full-screen moment: your own place, your first land or house, starting to build. */
const CELEBRATED: ReadonlySet<string> = new Set(['moved-in', 'purchased', 'house-purchased', 'building']);
/** Outcomes the server also announces with a push notification (show it once). */
const SERVER_NOTIFIED: ReadonlySet<string> = new Set(['moved-in', 'moved', 'purchased', 'house-purchased']);

export function useHousing() {
  return useQuery({ queryKey: housingKeys.overview, queryFn: homesApi.overview, refetchInterval: 60_000 });
}

/** This week's rentals across Lagos (filtered on the client so filters are instant). */
export function useListings() {
  return useQuery({ queryKey: housingKeys.listings, queryFn: homesApi.listings, staleTime: 60_000 });
}

export function useLandOffers() {
  return useQuery({ queryKey: housingKeys.land, queryFn: homesApi.land, staleTime: 60_000 });
}

/** This week's ready-built houses for sale across Lagos. */
export function useHouseListings() {
  return useQuery({ queryKey: housingKeys.houses, queryFn: homesApi.houses, staleTime: 60_000 });
}

/**
 * Every housing command answers with `{ title, message, tone, housing }`: write the view, refresh the wallet, and
 * tell the player what happened in the server's own words.
 */
function useHousingCommand<TVariables, TResult extends HousingActionResultDto = HousingActionResultDto>(
  fn: (variables: TVariables) => Promise<TResult>,
  failTitle: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      client.setQueryData(housingKeys.overview, result.housing);
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
      void client.invalidateQueries({ queryKey: housingKeys.listings });
      void client.invalidateQueries({ queryKey: housingKeys.land });
      void client.invalidateQueries({ queryKey: housingKeys.houses });
      announce(result.title, {
        body: result.message,
        tone: result.tone,
        sfx: result.tone === 'good' ? 'ui-success' : 'notification',
        serverNotifies: SERVER_NOTIFIED.has(result.outcome),
      });
      if (result.tone === 'good' && CELEBRATED.has(result.outcome)) {
        gameEvents.emit('celebrate', { kind: 'milestone', title: result.title, body: result.message });
      }
    },
    onError: (error) => complain(failTitle, error),
  });
}

export function useHousingCommands() {
  return {
    signLease: useHousingCommand(
      (listingId: string) => homesApi.signLease(listingId),
      'Couldn’t sign the lease',
    ),
    move: useHousingCommand((to: string) => homesApi.move(to), 'Couldn’t move'),
    buyLand: useHousingCommand(
      (body: BuyLandRequest) => homesApi.buyLand(body),
      'Land purchase didn’t go through',
    ),
    buyHouse: useHousingCommand(
      (listingId: string) => homesApi.buyHouse(listingId),
      'House purchase didn’t go through',
    ),
    perfectTitle: useHousingCommand(
      (propertyId: string) => homesApi.perfectTitle(propertyId),
      'Couldn’t start the paperwork',
    ),
    build: useHousingCommand(
      ({
        propertyId,
        blueprintId,
        payment,
      }: {
        propertyId: string;
        blueprintId: BlueprintId;
        payment: ConstructionPaymentPlan;
      }) => homesApi.build(propertyId, blueprintId, payment),
      'Couldn’t start building',
    ),
    tenancy: useHousingCommand(
      ({ propertyId, action }: { propertyId: string; action: TenancyAction }) =>
        homesApi.tenancy(propertyId, action),
      'Couldn’t change the tenancy',
    ),
    listForSale: useHousingCommand(
      (propertyId: string) => homesApi.listForSale(propertyId),
      'Couldn’t list it',
    ),
    cancelSale: useHousingCommand(
      (propertyId: string) => homesApi.cancelSale(propertyId),
      'Couldn’t cancel the sale',
    ),
  };
}
