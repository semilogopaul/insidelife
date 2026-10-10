'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronUp, DoorOpen, Target } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  homeLocationId,
  formatGameDuration,
  formatNairaCompact,
  isHomeLocation,
  type ActionDefinition,
} from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { queryKeys } from '@/common/api/query-keys';
import { PlaceIcon, venuePlaceKind, type PlaceKind } from '@/common/brand/place-icons';
import { Button, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useWorldState } from '@/common/game/use-game-clock';
import { useStickSide } from '@/common/hooks/use-touch-ui';
import {
  MORE_HERE_ID,
  actionEffects,
  actionPriceNote,
  isBusy,
  isPlaceAction,
  openService,
  placesApi,
  serviceOpensLabel,
  servicesAt,
  servicesWithGoal,
  useActionAvailability,
  useGoalHere,
  usePlaceActions,
  useStartAction,
  type GoalHere,
  type Place,
  type PlaceService,
} from '@/common/places';
import { cn } from '@/common/utils/cn';
import { useVisits } from '@/common/visits';

const priceNote = (note: string): string => (note ? ` · ${note}` : '');

/** The place's own things first (the life goal's on top), its services, then the do-anywhere ones under "Anywhere". */
function arrange(actions: readonly ActionDefinition[], goal: GoalHere | null) {
  const own = actions.filter(isPlaceAction);
  const goalFirst = goal?.actionId
    ? [...own].sort((a, b) => Number(b.id === goal.actionId) - Number(a.id === goal.actionId))
    : own;
  return { own: goalFirst, anywhere: actions.filter((action) => !isPlaceAction(action)) };
}

/** The pictogram for where you are: your home, a friend's house, or the venue's kind. */
const placeKind = (place: Place): PlaceKind =>
  place.kind === 'home'
    ? 'home'
    : place.kind === 'visit' || !place.venue
      ? 'house'
      : venuePlaceKind(place.venue);

/**
 * "What can I do here?" — shown while inside a place. Collapsed to a handle so the interior stays visible; when a life
 * goal sent you here, the handle says so. Lists the place's own actions first (price with the world index, duration,
 * what they do), its services (they open an app), then the do-anywhere ones under "Anywhere", plus Step outside. What
 * can't be done right now (closed, too young, not enough money…) is greyed out with the reason — the same rules the
 * world's hotspots use. The hotspots' "More here" button opens it.
 */
export function VenueSheet() {
  const { data: snapshot } = useSnapshot();
  const phoneOpen = useUi((state) => state.phoneOpen);
  // Clean screen: the bar goes with the rest of the HUD.
  const hudHidden = useUi((state) => state.settings.hudHidden);
  const { data: world } = useWorldState();
  const visiting =
    snapshot !== undefined &&
    isHomeLocation(snapshot.character.locationId) &&
    snapshot.character.locationId !== homeLocationId(snapshot.character.id);
  const visits = useVisits(visiting).data;
  const host =
    visits?.incoming.find((visit) => visit.home.locationId === snapshot?.character.locationId)?.host ?? null;
  const { place, actions } = usePlaceActions(snapshot, host?.firstName ?? null);
  const [expanded, setExpanded] = useState(false);
  // The HUD keeps the bottom of a phone clear while the sheet is up (no pills or buttons under it).
  useEffect(() => {
    useUi.getState().setPlaceSheetOpen(expanded);
    return () => useUi.getState().setPlaceSheetOpen(false);
  }, [expanded]);
  const client = useQueryClient();
  const { start, pending } = useStartAction();
  const [exiting, setExiting] = useState(false);
  // The HUD's phone button sits away from the walking stick: leave room on that side.
  const buttonsLeft = useStickSide() === 'right';
  const availability = useActionAvailability(snapshot);
  // What the place offers through your phone apps (browse cars, see a doctor…), and the goal that brought you here.
  const venueType = place?.venue?.type ?? null;
  const services = useMemo<readonly PlaceService[]>(
    () => (venueType ? servicesAt({ kind: 'venue', venueType }) : []),
    [venueType],
  );
  const ownActions = useMemo(() => actions.filter(isPlaceAction), [actions]);
  const goal = useGoalHere(venueType, ownActions, services);
  useEffect(
    () =>
      gameEvents.on('interact', ({ interactableId }) => {
        if (interactableId === MORE_HERE_ID) setExpanded(true);
      }),
    [],
  );

  if (!snapshot || !place || phoneOpen || hudHidden) return null;
  // Hanging around after arriving (or exploring) never blocks a new choice.
  const busy = isBusy(snapshot);
  const atHome = snapshot.character.locationId === homeLocationId(snapshot.character.id);
  const priceIndex = world?.economy.priceIndex ?? 1;
  const { own, anywhere } = arrange(actions, goal);
  const withGoal = servicesWithGoal(services, goal);
  const orderedServices = goal?.serviceId
    ? [...withGoal].sort((a, b) => Number(b.id === goal.serviceId) - Number(a.id === goal.serviceId))
    : withGoal;
  const actionItem = (action: ActionDefinition) => {
    const { reason } = availability(action);
    const isGoal = goal?.actionId === action.id;
    return (
      <li key={action.id}>
        <div
          className={cn(
            'flex h-full flex-col gap-2 rounded-card bg-white/6 p-3',
            isGoal && 'ring-2 ring-danfo',
          )}
        >
          <div className="flex items-start gap-2.5">
            <span aria-hidden className="text-2xl leading-none">
              {action.emoji}
            </span>
            <span className="min-w-0">
              <span className="block font-bold leading-tight">{action.label}</span>
              {isGoal && (
                <span className="mt-0.5 block text-xs font-bold text-danfo">
                  For your goal: {goal?.title}
                </span>
              )}
              <span className="mt-0.5 block text-xs text-on-ink-soft">{action.blurb}</span>
              {actionEffects(action).length > 0 && (
                <span className="mt-0.5 block text-xs text-on-ink">{actionEffects(action).join(' ')}</span>
              )}
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
                className={cn(
                  'h-8 rounded-chip bg-danfo px-2.5 text-xs font-bold text-ink disabled:opacity-40',
                )}
              >
                {formatGameDuration(minutes)}
                {priceNote(
                  actionPriceNote(action, priceIndex, snapshot.summary.pantryMeals, formatNairaCompact),
                )}
              </button>
            ))}
          </div>
        </div>
      </li>
    );
  };

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
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:px-24',
        buttonsLeft ? 'pl-24 pr-3' : 'pl-3 pr-24',
      )}
    >
      <section
        aria-label={`Things to do at ${place.name}`}
        className={cn(
          'pointer-events-auto w-full max-w-xl rounded-sheet text-on-ink',
          // Pulled up it's a solid panel: nothing in the room or the HUD reads through it.
          expanded ? 'bg-ink/95 shadow-[var(--shadow-glass)] ring-1 ring-white/10 backdrop-blur-md' : 'glass',
        )}
      >
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <PlaceIcon kind={placeKind(place)} size={36} decorative />
          <span className="min-w-0 flex-1">
            <span className="type-title block truncate text-lg">{place.name}</span>
            {goal && !expanded ? (
              <span className="flex items-center gap-1 truncate text-xs font-bold text-danfo">
                <Target size={13} aria-hidden className="shrink-0" />
                For your goal: {goal.title} — {goal.label}
              </span>
            ) : (
              <span className="block truncate text-xs text-on-ink-soft">
                {expanded ? place.blurb : thingsToDo(own.length + services.length)}
                {atHome &&
                  ` · Kitchen: ${snapshot.summary.pantryMeals > 0 ? `${snapshot.summary.pantryMeals} meals` : 'empty — buy groceries in Shop'}`}
              </span>
            )}
          </span>
          {expanded ? <ChevronDown size={20} aria-hidden /> : <ChevronUp size={20} aria-hidden />}
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <ul className="grid max-h-[40dvh] gap-1.5 overflow-y-auto px-3 pb-2 sm:grid-cols-2">
                {own.map(actionItem)}
                {orderedServices.map((service) => (
                  <li key={service.id}>
                    <div
                      className={cn(
                        'flex h-full flex-col gap-2 rounded-card bg-white/6 p-3',
                        goal?.serviceId === service.id && 'ring-2 ring-danfo',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <span aria-hidden className="text-2xl leading-none">
                          {service.emoji}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-bold leading-tight">{service.label}</span>
                          {goal?.serviceId === service.id && (
                            <span className="mt-0.5 block text-xs font-bold text-danfo">
                              For your goal: {goal.title}
                            </span>
                          )}
                          <span className="mt-0.5 block text-xs text-on-ink-soft">{service.blurb}</span>
                        </span>
                      </div>
                      <div className="mt-auto flex">
                        <button
                          type="button"
                          onClick={() => {
                            setExpanded(false);
                            openService(service, snapshot.character.locationId);
                          }}
                          className="h-8 rounded-chip bg-white/12 px-2.5 text-xs font-bold text-on-ink"
                        >
                          {serviceOpensLabel(service)}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
                {anywhere.length > 0 && (
                  <li className="px-1 pt-2 text-2xs font-bold uppercase tracking-wide text-on-ink-soft sm:col-span-2">
                    Anywhere · also on your phone
                  </li>
                )}
                {anywhere.map(actionItem)}
              </ul>
              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
                <p className="text-xs text-on-ink-soft">
                  {busy
                    ? 'Finish or stop what you’re doing to start something else.'
                    : 'Prices move with the economy.'}
                </p>
                <Button
                  variant="paper"
                  size="sm"
                  icon={<DoorOpen size={16} aria-hidden />}
                  loading={exiting}
                  onClick={() => void stepOutside()}
                >
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

/** "1 thing to do here", "4 things to do here". */
export function thingsToDo(count: number): string {
  return `${count} ${count === 1 ? 'thing' : 'things'} to do here`;
}
