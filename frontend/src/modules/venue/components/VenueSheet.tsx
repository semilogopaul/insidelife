'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronUp, DoorOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { homeLocationId, formatGameDuration, formatNairaCompact, isHomeLocation } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { queryKeys } from '@/common/api/query-keys';
import { Button, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useWorldState } from '@/common/game/use-game-clock';
import { useStickSide } from '@/common/hooks/use-touch-ui';
import { MORE_HERE_ID, actionPriceNote, isBusy, placesApi, servicesAt, useActionAvailability, usePlaceActions, useStartAction } from '@/common/places';
import { cn } from '@/common/utils/cn';
import { useVisits } from '@/common/visits';

const priceNote = (note: string): string => (note ? ` · ${note}` : '');

/**
 * "What can I do here?" — shown while inside a place. Collapsed to a handle so the interior stays visible.
 * Lists actions with price (world price index applied) and duration, plus Step outside. What can't be done right now
 * (closed, too young, not enough money…) is greyed out with the reason — the same rules the world's hotspots use.
 * The hotspots' "More here" button opens it.
 */
export function VenueSheet() {
  const { data: snapshot } = useSnapshot();
  const phoneOpen = useUi((state) => state.phoneOpen);
  const openPhone = useUi((state) => state.openPhone);
  const { data: world } = useWorldState();
  const visiting = snapshot !== undefined && isHomeLocation(snapshot.character.locationId) && snapshot.character.locationId !== homeLocationId(snapshot.character.id);
  const visits = useVisits(visiting).data;
  const host = visits?.incoming.find((visit) => visit.home.locationId === snapshot?.character.locationId)?.host ?? null;
  const { place, actions } = usePlaceActions(snapshot, host?.firstName ?? null);
  const [expanded, setExpanded] = useState(false);
  const client = useQueryClient();
  const { start, pending } = useStartAction();
  const [exiting, setExiting] = useState(false);
  // The HUD's phone button sits away from the walking stick: leave room on that side.
  const buttonsLeft = useStickSide() === 'right';
  const availability = useActionAvailability(snapshot);
  useEffect(
    () =>
      gameEvents.on('interact', ({ interactableId }) => {
        if (interactableId === MORE_HERE_ID) setExpanded(true);
      }),
    [],
  );

  if (!snapshot || !place || phoneOpen) return null;
  // Hanging around after arriving (or exploring) never blocks a new choice.
  const busy = isBusy(snapshot);
  const atHome = snapshot.character.locationId === homeLocationId(snapshot.character.id);
  // What the place offers through your phone apps (browse cars, see a doctor…), after the actions.
  const services = place.venue ? servicesAt({ kind: 'venue', venueType: place.venue.type }) : [];
  const priceIndex = world?.economy.priceIndex ?? 1;

  const stepOutside = async (): Promise<void> => {
    setExiting(true);
    try {
      const { snapshot: next, spawn } = await placesApi.exit();
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
    <div className={cn('pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:px-24', buttonsLeft ? 'pl-24 pr-3' : 'pl-3 pr-24')}>
      <section aria-label={`Things to do at ${place.name}`} className="glass pointer-events-auto w-full max-w-xl rounded-sheet text-on-ink">
        <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="flex w-full items-center gap-3 px-4 py-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="type-title block truncate text-lg">{place.name}</span>
            <span className="block truncate text-xs text-on-ink-soft">
              {expanded ? place.blurb : `${actions.length + services.length} things to do here`}
              {atHome && ` · Kitchen: ${snapshot.summary.pantryMeals > 0 ? `${snapshot.summary.pantryMeals} meals` : 'empty — buy groceries in Shop'}`}
            </span>
          </span>
          {expanded ? <ChevronDown size={20} aria-hidden /> : <ChevronUp size={20} aria-hidden />}
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
              <ul className="grid max-h-[40dvh] gap-1.5 overflow-y-auto px-3 pb-2 sm:grid-cols-2">
                {actions.map((action) => {
                  const { reason } = availability(action);
                  return (
                  <li key={action.id}>
                    <div className="flex h-full flex-col gap-2 rounded-card bg-white/6 p-3">
                      <div className="flex items-start gap-2.5">
                        <span aria-hidden className="text-2xl leading-none">{action.emoji}</span>
                        <span className="min-w-0">
                          <span className="block font-bold leading-tight">{action.label}</span>
                          <span className="mt-0.5 block text-xs text-on-ink-soft">{action.blurb}</span>
                          {reason && !busy && <span className="mt-1 block text-xs font-bold text-danfo">{reason}</span>}
                        </span>
                      </div>
                      <div className="mt-auto flex flex-wrap gap-1.5">
                        {action.durations.map((minutes) => (
                          <button
                            key={minutes}
                            type="button"
                            disabled={reason !== null || pending}
                            onClick={() => start(action, minutes, { onSuccess: () => setExpanded(false) })}
                            className={cn('h-8 rounded-chip bg-danfo px-2.5 text-xs font-bold text-ink disabled:opacity-40')}
                          >
                            {formatGameDuration(minutes)}
                            {priceNote(actionPriceNote(action, priceIndex, snapshot.summary.pantryMeals, formatNairaCompact))}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                  );
                })}
                {services.map((service) => (
                  <li key={service.id}>
                    <div className="flex h-full flex-col gap-2 rounded-card bg-white/6 p-3">
                      <div className="flex items-start gap-2.5">
                        <span aria-hidden className="text-2xl leading-none">{service.emoji}</span>
                        <span className="min-w-0">
                          <span className="block font-bold leading-tight">{service.label}</span>
                          <span className="mt-0.5 block text-xs text-on-ink-soft">{service.blurb}</span>
                        </span>
                      </div>
                      <div className="mt-auto flex">
                        <button
                          type="button"
                          onClick={() => {
                            gameEvents.emit('sfx', { id: 'ui-open' });
                            setExpanded(false);
                            openPhone(service.app, service.param ?? null);
                          }}
                          className="h-8 rounded-chip bg-white/12 px-2.5 text-xs font-bold text-on-ink"
                        >
                          Open on your phone
                        </button>
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
