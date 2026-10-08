'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { findAction, type TransportMode } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { queryKeys } from '@/common/api/query-keys';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useNavigation } from '@/common/game/navigation-store';
import { useSnapshot, useSnapshotMutation } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { hudApi } from '../services/hud.api';
import type { SuggestionAction } from '../services/suggestions';

/** Smart next steps for the HUD; refreshed whenever the snapshot changes (and every minute). */
export function useSuggestions() {
  const asOf = useSnapshot().data?.asOf ?? null;
  return useQuery({
    queryKey: queryKeys.domain('hud', 'suggestions', asOf ?? 0),
    queryFn: hudApi.suggestions,
    enabled: asOf !== null,
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export const actionLabel = (actionId: string): string | null => findAction(actionId)?.label ?? null;

/** Runs a suggestion action: GPS, book a ride, start the action here, or open Goals. */
export function useSuggestionRunner() {
  const setDestination = useNavigation((state) => state.setDestination);
  const openPhone = useUi((state) => state.openPhone);
  const book = useSnapshotMutation(({ locationId, mode }: { locationId: string; mode: TransportMode }) => hudApi.book(locationId, mode));
  const act = useSnapshotMutation(({ actionId, minutes }: { actionId: string; minutes: number }) => hudApi.startAction(actionId, minutes));

  const run = (action: SuggestionAction, onDone?: () => void): void => {
    switch (action.kind) {
      case 'directions':
        setDestination(action.locationId, action.name);
        gameEvents.emit('sfx', { id: 'ui-success' });
        onDone?.();
        return;
      case 'goals':
        gameEvents.emit('sfx', { id: 'ui-open' });
        openPhone('goals');
        onDone?.();
        return;
      case 'ride':
        book.mutate(
          { locationId: action.locationId, mode: action.mode },
          {
            onSuccess: () => {
              gameEvents.emit('sfx', { id: action.mode === 'danfo' ? 'danfo-conductor' : 'car-door' });
              toast({ title: 'Ride booked', body: 'Sit tight — you’re on your way.', tone: 'neutral', amount: -action.fare });
              onDone?.();
            },
            onError: (error) => {
              gameEvents.emit('sfx', { id: 'ui-error' });
              toast({ title: 'Couldn’t book that ride', body: errorMessage(error), tone: 'bad' });
            },
          },
        );
        return;
      case 'act': {
        const minutes = findAction(action.actionId)?.durations[0];
        if (minutes === undefined) return;
        act.mutate(
          { actionId: action.actionId, minutes },
          {
            onSuccess: () => {
              gameEvents.emit('sfx', { id: 'ui-success' });
              onDone?.();
            },
            onError: (error) => {
              gameEvents.emit('sfx', { id: 'ui-error' });
              toast({ title: 'Can’t do that right now', body: errorMessage(error), tone: 'bad' });
            },
          },
        );
        return;
      }
    }
  };
  return { run, busy: book.isPending || act.isPending };
}
