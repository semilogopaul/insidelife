'use client';

import { useCallback } from 'react';
import type { ActionDefinition } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshotMutation } from '@/common/game/snapshot';
import { placesApi } from './places.api';

export interface StartActionOptions {
  readonly onSuccess?: () => void;
}

/**
 * Start an action where you are (`POST /characters/me/actions`): the server checks the place, prices and plans it and
 * returns the new snapshot, which goes straight into the cache (the world then walks the avatar to it). Plays the
 * usual success/error feedback. Shared by the venue sheet and the world's hotspots.
 */
export function useStartAction(): {
  readonly start: (action: ActionDefinition, minutes?: number, options?: StartActionOptions) => void;
  readonly pending: boolean;
} {
  const mutation = useSnapshotMutation(
    ({ action, minutes }: { readonly action: ActionDefinition; readonly minutes: number }) =>
      placesApi.startAction(action.id, minutes),
  );
  const { mutate } = mutation;
  const start = useCallback(
    (
      action: ActionDefinition,
      minutes: number = action.durations[0] ?? 60,
      options: StartActionOptions = {},
    ) =>
      mutate(
        { action, minutes },
        {
          onSuccess: () => {
            gameEvents.emit('sfx', { id: action.category === 'food' ? 'eat' : 'ui-success' });
            options.onSuccess?.();
          },
          onError: (error) => {
            gameEvents.emit('sfx', { id: 'ui-error' });
            toast({
              title: `Can’t ${action.label.toLowerCase()} right now`,
              body: errorMessage(error),
              tone: 'bad',
            });
          },
        },
      ),
    [mutate],
  );
  return { start, pending: mutation.isPending };
}
