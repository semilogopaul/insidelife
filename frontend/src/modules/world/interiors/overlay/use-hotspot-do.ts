'use client';

import { useCallback, useEffect, useRef } from 'react';
import { findAction, type ActionDefinition } from '@insidelife/shared';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { openService, serviceOfInteractable, useStartAction, type PlaceService } from '@/common/places';
import { actionOfInteractable } from '../hotspots/hotspots';
import { useHomeView } from '../walk/home-view-store';

export interface HotspotHandlers {
  /**
   * Start an action chosen at a hotspot (from its card, or the HUD context button). Defaults to the server
   * (`POST /characters/me/actions`, like the venue sheet); previews without a session pass their own.
   */
  readonly onStartAction?: (action: ActionDefinition, minutes?: number) => void;
  /** Open a place service (defaults to its phone app on the right tab, or its panel). */
  readonly onOpenService?: (service: PlaceService) => void;
}

/** Why a hotspot entry can't be done now, as its card shows it (null when it can). */
function disabledReason(entryId: string): string | null {
  for (const card of useHomeView.getState().hotspots) {
    const entry = card.entries.find((candidate) => candidate.id === entryId);
    if (entry) return entry.disabled;
  }
  return null;
}

/**
 * Doing something at a hotspot, by its entry id (`hotspot:<action>` or `service:<id>`): a service opens its app or
 * panel; an action starts (the avatar then walks to its spot) — or, when it can't be done now, says why instead of
 * asking the server. Also answers the HUD context button (`interact`). Returns the doer for the card.
 */
export function useHotspotDo({
  onStartAction,
  onOpenService,
}: HotspotHandlers): (entryId: string, minutes?: number) => boolean {
  const { start } = useStartAction();
  const latest = useRef({ start, onStartAction, onOpenService });
  useEffect(() => {
    latest.current = { start, onStartAction, onOpenService };
  });
  const run = useCallback((entryId: string, minutes?: number): boolean => {
    const service = serviceOfInteractable(entryId);
    if (service) {
      const locationId = useHomeView.getState().house?.split('|')[0] ?? null;
      const open =
        latest.current.onOpenService ?? ((chosen: PlaceService) => openService(chosen, locationId));
      open(service);
      return true;
    }
    const actionId = actionOfInteractable(entryId);
    const action = actionId ? findAction(actionId) : undefined;
    if (!action) return false;
    const reason = disabledReason(entryId);
    if (reason) {
      gameEvents.emit('sfx', { id: 'ui-error' });
      toast({ title: `Can’t ${action.label.toLowerCase()} right now`, body: reason, tone: 'neutral' });
      return false;
    }
    const { onStartAction: custom, start: server } = latest.current;
    if (custom) custom(action, minutes);
    else server(action, minutes);
    return true;
  }, []);
  useEffect(() => gameEvents.on('interact', ({ interactableId }) => void run(interactableId)), [run]);
  return run;
}
