'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronUp, DoorOpen } from 'lucide-react';
import { useState } from 'react';
import { homeLocationId, formatGameDuration, formatNairaCompact, type ActionDefinition } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { queryKeys } from '@/common/api/query-keys';
import { Button, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot, useSnapshotMutation } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useWorldState } from '@/common/game/use-game-clock';
import { cn } from '@/common/utils/cn';
import { usePlaceActions } from '../hooks/use-place-actions';
import { venueApi } from '../services/venue.api';

/**
 * "What can I do here?" — shown while inside a place. Collapsed to a handle so the interior stays visible.
 * Lists actions with price (world price index applied) and duration, plus Step outside.
 */
export function VenueSheet() {
  const { data: snapshot } = useSnapshot();
  const phoneOpen = useUi((state) => state.phoneOpen);
  const { data: world } = useWorldState();
  const { place, actions } = usePlaceActions(snapshot);
  const [expanded, setExpanded] = useState(false);
  const client = useQueryClient();
  const start = useSnapshotMutation(({ action, minutes }: { action: ActionDefinition; minutes: number }) => venueApi.startAction(action.id, minutes));
  const [exiting, setExiting] = useState(false);

  if (!snapshot || !place || phoneOpen) return null;
  const busy = snapshot.timeline[0]?.kind === 'action' && snapshot.timeline[0].explicit;
  const atHome = snapshot.character.locationId === homeLocationId(snapshot.character.id);
  const priceIndex = world?.economy.priceIndex ?? 1;

  const stepOutside = async (): Promise<void> => {
    setExiting(true);
    try {
      const { snapshot: next, spawn } = await venueApi.exit();
      client.setQueryData(queryKeys.snapshot, next);
      gameEvents.emit('sfx', { id: 'door-open' });
      gameEvents.emit('exit-building', { spawn });
    } catch (error) {
      toast({ title: 'Can’t step outside yet', body: errorMessage(error), tone: 'bad' });
    } finally {
      setExiting(false);
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[max(env(safe-area-inset-bottom),0.75rem)] pl-3 pr-24 sm:px-24">
      <section aria-label={`Things to do at ${place.name}`} className="glass pointer-events-auto w-full max-w-xl rounded-sheet text-on-ink">
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="flex w-full items-center gap-3 px-4 py-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="type-title block truncate text-lg">{place.name}</span>
            <span className="block truncate text-xs text-on-ink-soft">
              {expanded ? place.blurb : `${actions.length} things to do here`}
              {atHome && ` · Kitchen: ${snapshot.summary.pantryMeals > 0 ? `${snapshot.summary.pantryMeals} meals` : 'empty — buy groceries in Shop'}`}
            </span>
          </span>
          {expanded ? <ChevronDown size={20} aria-hidden /> : <ChevronUp size={20} aria-hidden />}
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
              <ul className="grid max-h-[40dvh] gap-1.5 overflow-y-auto px-3 pb-2 sm:grid-cols-2">
                {actions.map((action) => (
                  <li key={action.id}>
                    <div className="flex h-full flex-col gap-2 rounded-card bg-white/6 p-3">
                      <div className="flex items-start gap-2.5">
                        <span aria-hidden className="text-2xl leading-none">{action.emoji}</span>
                        <span className="min-w-0">
                          <span className="block font-bold leading-tight">{action.label}</span>
                          <span className="mt-0.5 block text-xs text-on-ink-soft">{action.blurb}</span>
                        </span>
                      </div>
                      <div className="mt-auto flex flex-wrap gap-1.5">
                        {action.durations.map((minutes) => (
                          <button
                            key={minutes}
                            type="button"
                            disabled={busy || start.isPending}
                            onClick={() =>
                              start.mutate(
                                { action, minutes },
                                {
                                  onSuccess: () => {
                                    gameEvents.emit('sfx', { id: action.category === 'food' ? 'eat' : 'ui-success' });
                                    setExpanded(false);
                                  },
                                  onError: (error) => {
                                    gameEvents.emit('sfx', { id: 'ui-error' });
                                    toast({ title: `Can’t ${action.label.toLowerCase()} right now`, body: errorMessage(error), tone: 'bad' });
                                  },
                                },
                              )
                            }
                            className={cn('h-8 rounded-chip bg-danfo px-2.5 text-xs font-bold text-ink disabled:opacity-40')}
                          >
                            {formatGameDuration(minutes)}
                            {action.usesPantry && snapshot.summary.pantryMeals > 0
                              ? ' · from your kitchen'
                              : action.cost > 0
                                ? ` · ${formatNairaCompact(Math.round(action.cost * priceIndex))}`
                                : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
                <p className="text-xs text-on-ink-soft">{busy ? 'Finish or stop what you’re doing to start something else.' : 'Prices move with the economy.'}</p>
                <Button variant="paper" size="sm" icon={<DoorOpen size={16} aria-hidden />} loading={exiting} onClick={() => void stepOutside()}>
                  Step outside
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
