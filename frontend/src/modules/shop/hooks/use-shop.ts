'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Outfit, WardrobeDto } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { decorKey, useDecorEdit } from '@/common/decor';
import { shopApi } from '../services/shop.api';
import { useCurrentPlace } from '@/common/hooks/use-current-place';

export const shopKeys = {
  catalogue: (locationId: string) => queryKeys.domain('shop', locationId),
  cataloguePrefix: queryKeys.domain('shop'),
  inventory: queryKeys.domain('inventory'),
  wardrobe: queryKeys.domain('wardrobe'),
} as const;

/** Catalogue keyed by where you stand (in-store availability depends on it). */
export function useCatalogue() {
  const { locationId } = useCurrentPlace();
  return useQuery({
    queryKey: shopKeys.catalogue(locationId ?? 'unknown'),
    queryFn: shopApi.catalogue,
    // Moving between places changes the key: keep showing the last view while the new one loads.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useInventory() {
  return useQuery({ queryKey: shopKeys.inventory, queryFn: shopApi.inventory, refetchInterval: 60_000 });
}

export function useWardrobe() {
  return useQuery({ queryKey: shopKeys.wardrobe, queryFn: shopApi.wardrobe });
}

function useRefresh() {
  const client = useQueryClient();
  return (): void => {
    void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    void client.invalidateQueries({ queryKey: shopKeys.cataloguePrefix });
    void client.invalidateQueries({ queryKey: shopKeys.inventory });
    void client.invalidateQueries({ queryKey: shopKeys.wardrobe });
    // Belongings unlock jobs (laptop, car) and comfort at home.
    void client.invalidateQueries({ queryKey: queryKeys.domain('jobs') });
    void client.invalidateQueries({ queryKey: queryKeys.domain('housing') });
    // Furniture arrives as pieces standing in your rooms.
    void client.invalidateQueries({ queryKey: decorKey });
    void client.invalidateQueries({ queryKey: queryKeys.domain('decor', 'home') });
  };
}

export function useShopCommands() {
  const refresh = useRefresh();
  return {
    purchase: useMutation({
      // Furniture goes into the room of your home you are in (the server ignores it anywhere else).
      mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
        shopApi.purchase(itemId, quantity, useDecorEdit.getState().homeRoom?.roomId),
      onSuccess: refresh,
    }),
    sell: useMutation({
      mutationFn: ({ inventoryId, quantity }: { inventoryId: string; quantity: number }) =>
        shopApi.sell(inventoryId, quantity),
      onSuccess: refresh,
    }),
    repair: useMutation({ mutationFn: shopApi.repair, onSuccess: refresh }),
  };
}

/** Save the outfit: write the wardrobe view and refresh the snapshot so the world avatar changes clothes. */
export function useDress() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (outfit: Outfit) => shopApi.dress(outfit),
    onSuccess: (wardrobe: WardrobeDto) => {
      client.setQueryData(shopKeys.wardrobe, wardrobe);
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
      void client.invalidateQueries({ queryKey: shopKeys.inventory });
    },
  });
}
