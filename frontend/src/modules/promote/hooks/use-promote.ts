'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { BillboardSlotId, CreateCampaignRequest, CreateClubOrderRequest } from '@insidelife/shared';
import { gameEvents } from '@/common/game/game-events';
import { promoteApi, promoteKeys } from '../services/promote.api';
import { toSlotCatalog } from '../services/slot-views';

export function useSlots() {
  return useQuery({ queryKey: promoteKeys.slots, queryFn: promoteApi.slots, staleTime: 30_000, select: toSlotCatalog });
}

export function useCampaigns() {
  return useQuery({ queryKey: promoteKeys.campaigns, queryFn: promoteApi.campaigns, staleTime: 15_000 });
}

export function useTracks() {
  return useQuery({ queryKey: promoteKeys.tracks, queryFn: promoteApi.tracks, staleTime: 15_000 });
}

/** Leave for checkout (Flutterwave or the dev sandbox). The browser returns to /payments/callback. */
function leaveForCheckout(url: string): void {
  gameEvents.emit('sfx', { id: 'ui-click' });
  window.location.assign(url);
}

export function useCreateCampaign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCampaignRequest) => promoteApi.createCampaign(body),
    onSuccess: (checkout) => {
      void client.invalidateQueries({ queryKey: promoteKeys.campaigns });
      leaveForCheckout(checkout.authorizationUrl);
    },
    onError: () => {
      gameEvents.emit('sfx', { id: 'ui-error' });
      // The slot may have filled up (DATES_CHANGED, SLOT_FULL): show the new next free dates.
      void client.invalidateQueries({ queryKey: promoteKeys.slots });
    },
  });
}

export function useCancelCampaign() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => promoteApi.cancelCampaign(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: promoteKeys.campaigns });
      void client.invalidateQueries({ queryKey: promoteKeys.slots });
    },
  });
}

export function useOrderRotation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ trackId, body }: { readonly trackId: string; readonly body: CreateClubOrderRequest }) => promoteApi.orderRotation(trackId, body),
    onSuccess: (checkout) => {
      void client.invalidateQueries({ queryKey: promoteKeys.tracks });
      leaveForCheckout(checkout.authorizationUrl);
    },
    onError: () => {
      gameEvents.emit('sfx', { id: 'ui-error' });
      // The rotation's next free day (and the price) come with the slots: refresh them after a refusal.
      void client.invalidateQueries({ queryKey: promoteKeys.slots });
    },
  });
}

/** Upload with a live progress ratio (0–1). */
export function useCreativeUpload() {
  const [progress, setProgress] = useState(0);
  const mutation = useMutation({
    mutationFn: ({ slotId, file }: { readonly slotId: BillboardSlotId; readonly file: File }) => {
      setProgress(0);
      return promoteApi.uploadCreative(slotId, file, { onProgress: setProgress });
    },
  });
  return { ...mutation, progress };
}

export function useTrackUpload() {
  const client = useQueryClient();
  const [progress, setProgress] = useState(0);
  const mutation = useMutation({
    mutationFn: ({ artistName, title, file }: { readonly artistName: string; readonly title: string; readonly file: File }) => {
      setProgress(0);
      return promoteApi.uploadTrack({ artistName, title }, file, { onProgress: setProgress });
    },
    onSuccess: () => {
      gameEvents.emit('sfx', { id: 'ui-success' });
      void client.invalidateQueries({ queryKey: promoteKeys.tracks });
    },
    onError: () => gameEvents.emit('sfx', { id: 'ui-error' }),
  });
  return { ...mutation, progress };
}
