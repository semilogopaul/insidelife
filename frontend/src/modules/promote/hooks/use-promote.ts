'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { BillboardSlotId, CreateCampaignRequest, CreateClubOrderRequest } from '@insidelife/shared';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { checkErrorAlert, checkPayment, invalidateAfterPayment } from '@/common/payments';
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

/** An ad's "what you paid for" page (stats refresh every 30 s while it's open). */
export function useCampaignDetail(id: string) {
  return useQuery({ queryKey: promoteKeys.campaign(id), queryFn: () => promoteApi.campaign(id), staleTime: 15_000, refetchInterval: 30_000 });
}

/** A song order's page; refreshed every 20 s so "playing now" and the next times stay right. */
export function useClubOrderDetail(id: string) {
  return useQuery({ queryKey: promoteKeys.clubOrder(id), queryFn: () => promoteApi.clubOrder(id), staleTime: 10_000, refetchInterval: 20_000 });
}

/**
 * "I've paid: check now": asks the server to verify the payment with Flutterwave right away (delivers it if paid),
 * then refreshes everything that depends on it and says what happened.
 */
export function useCheckPayment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reference: string) => checkPayment(reference),
    onSuccess: async (result) => {
      await invalidateAfterPayment(client);
      const { payment } = result;
      if (payment.status === 'success') {
        gameEvents.emit('sfx', { id: 'ui-success' });
        toast({ title: 'Payment confirmed', body: payment.fulfilled ? 'It’s in review now. We’ll tell you when a moderator approves it.' : 'Finishing your booking now.', tone: 'good' });
      } else if (payment.status === 'initialized') {
        toast({ title: 'Not paid yet', body: 'Flutterwave hasn’t received this payment. If you just paid by transfer or USSD, give it a minute and check again.', tone: 'neutral' });
      } else {
        toast({ title: 'That payment didn’t go through', body: 'Nothing was charged. You can book again.', tone: 'neutral' });
      }
    },
    onError: (error) => {
      gameEvents.emit('sfx', { id: 'ui-error' });
      const alert = checkErrorAlert(error);
      toast({ title: alert.title, body: alert.body, tone: alert.tone });
    },
  });
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
