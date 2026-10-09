'use client';

import { Smartphone } from 'lucide-react';
import { useUnreadDms } from '@/common/chat';
import { useState, type ReactNode } from 'react';
import type { CharacterSnapshotDto } from '@insidelife/shared';
import { api } from '@/common/api/http';
import { errorMessage } from '@/common/api/api-error';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useNavigation } from '@/common/game/navigation-store';
import { useSnapshotMutation } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useWorld, type Interactable } from '@/common/game/world-store';
import { useMediaQuery } from '@/common/hooks/use-media-query';
import { useStickSide } from '@/common/hooks/use-touch-ui';
import { cn } from '@/common/utils/cn';
import { useHudData } from '../hooks/use-hud-data';
import { useSuggestions } from '../hooks/use-suggestions';
import { isRoutineDue } from '../services/suggestions';
import { ActivityBanner } from './ActivityBanner';
import { ClockCard } from './ClockCard';
import { DrivePanel } from './DrivePanel';
import { GpsBanner } from './GpsBanner';
import { RoutinePrompt } from './RoutinePrompt';
import { SuggestionChips } from './SuggestionChips';
import { VitalsPanel } from './VitalsPanel';
import { WalletChip } from './WalletChip';

export interface HudProps {
  /**
   * Extra HUD controls from other features, shown under the wallet (top-right): e.g. the notification bell and the
   * pending-decisions chip. The composition root supplies them (features can't import each other).
   */
  readonly tray?: ReactNode;
  /**
   * The minimap, shown only outdoors (walking, driving, riding). Bottom-left on tablets and desktops (where drivers
   * look); top-right under the wallet on phones, where the bottom-left thumb is busy with the joystick.
   */
  readonly map?: ReactNode;
  /** Cards from other features under the GPS banner (e.g. home visit invites); render nothing when idle. */
  readonly notices?: ReactNode;
}

/** Phones: the context button's bottom edge sits this high (phone button + gaps) and is this tall; options add more. */
const CONTEXT_BASE_PX = 64 + 8 + 48 + 8;
const CONTEXT_OPTION_PX = 46;
/** Inside: the suggestions clear the collapsed venue sheet. */
const SHEET_LIFT_PX = 76;

/**
 * The context button (and, at a hotspot with several things to do, the others as smaller buttons above it, keys 1–4).
 * Something that can't be done right now stays visible, greyed out with the reason; pressing it explains.
 */
function ContextActions({ nearby, alignStart }: { readonly nearby: Interactable; readonly alignStart: boolean }) {
  return (
    <div className={cn('flex flex-col gap-1.5', alignStart ? 'items-start' : 'items-end')} data-testid="context-actions">
      {nearby.more?.map((option, index) => (
        <button
          key={option.id}
          type="button"
          aria-disabled={option.disabled ? true : undefined}
          aria-label={option.disabled ? `${option.label}. Not now: ${option.disabled}` : undefined}
          onClick={() => gameEvents.emit('interact', { interactableId: option.id })}
          className={cn(
            'glass flex min-h-10 max-w-[17rem] items-center gap-1.5 rounded-card px-3 py-1 text-left text-sm font-bold text-on-ink',
            option.disabled && 'opacity-80',
          )}
        >
          {option.emoji && <span aria-hidden>{option.emoji}</span>}
          <span className="min-w-0">
            <span className={cn('block truncate', option.disabled && 'text-on-ink-soft')}>{option.label}</span>
            {option.disabled && <span className="block truncate text-2xs font-normal text-danfo">{option.disabled}</span>}
          </span>
          {index < 4 && <kbd className="ml-auto rounded bg-white/15 px-1.5 py-0.5 text-2xs pointer-coarse:hidden">{index + 1}</kbd>}
        </button>
      ))}
      <button
        type="button"
        aria-disabled={nearby.disabled ? true : undefined}
        aria-label={nearby.disabled ? `${nearby.label}. Not now: ${nearby.disabled}` : undefined}
        onClick={() => gameEvents.emit('interact', { interactableId: nearby.id })}
        className={cn(
          'flex min-h-12 max-w-[19rem] items-center gap-2 rounded-card px-4 py-1 text-left font-bold shadow-[var(--shadow-lift)]',
          nearby.disabled ? 'bg-paper-2 text-text-soft' : 'bg-paper text-ink',
        )}
      >
        {nearby.emoji && (
          <span aria-hidden className="text-lg leading-none">
            {nearby.emoji}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate">{nearby.label}</span>
          {nearby.disabled && <span className="block truncate text-xs font-bold text-ink">⛔ {nearby.disabled}</span>}
        </span>
        <kbd className="rounded bg-paper-3 px-1.5 py-0.5 text-xs pointer-coarse:hidden">E</kbd>
      </button>
    </div>
  );
}

/**
 * In-world HUD. Top: time/place + vitals (left), GPS and routine prompts (centre), wallet + tray (right).
 * Bottom: smart suggestions + current activity, and speed/fuel, context action and phone. On touch screens the
 * context and phone buttons sit on the side away from the walking stick (the player's setting, right by default) and
 * the stick's side is kept clear while moving. Inside a building the suggestions stack lifts above the venue sheet so
 * they never overlap.
 */
export function Hud({ tray, map, notices }: HudProps) {
  const data = useHudData();
  const openPhone = useUi((state) => state.openPhone);
  const phoneOpen = useUi((state) => state.phoneOpen);
  const unreadDms = useUnreadDms();
  const nearby = useWorld((state) => state.nearby);
  const drive = useWorld((state) => state.drive);
  const mode = useWorld((state) => state.mode);
  const navigation = useNavigation();
  const suggestions = useSuggestions();
  const wide = useMediaQuery('(min-width: 768px)');
  // Stick on the right: the buttons go bottom-left and the bottom-right is the thumb zone.
  const flip = useStickSide() === 'right';
  const inside = data?.inside === true;
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const cancel = useSnapshotMutation(() => api.delete<CharacterSnapshotDto>('/characters/me/actions/current'));

  if (!data) return null;
  // On phones a long context button ("🍹 Drinks at the lounge · ₦18,000", options above it) shares no row with the
  // suggestions: they lift above it.
  const contextLift = !wide && nearby ? CONTEXT_BASE_PX + (nearby.disabled ? 14 : 0) + (nearby.more?.length ?? 0) * CONTEXT_OPTION_PX : 0;
  // On phones the stick's corner is the walking/steering thumb zone: keep it clear while moving around outside.
  const thumbZoneBusy = !wide && (mode === 'walking' || mode === 'driving');
  const showActivity =
    data.segment &&
    (data.segment.kind === 'action' || data.segment.kind === 'commute' || data.segment.kind === 'work' || data.segment.kind === 'lecture' || data.segment.kind === 'sleep') &&
    !(thumbZoneBusy && data.action?.id === 'explore');

  const outdoorMap = map && !data.inside ? map : null;
  const all = suggestions.data ?? [];
  const routine = data.free && !drive ? (all.find((suggestion) => isRoutineDue(suggestion, data.minute) && !skipped.has(suggestion.id)) ?? null) : null;
  const chips = all.filter((suggestion) => suggestion.id !== routine?.id);

  const gps = navigation.destinationId ? (
    <GpsBanner
      instruction={navigation.instruction}
      destination={navigation.destinationName ?? 'destination'}
      remaining={navigation.remainingMetres}
      onStop={() => navigation.setDestination(null)}
    />
  ) : null;
  const routinePrompt = routine ? <RoutinePrompt suggestion={routine} now={data.minute} onSkip={() => setSkipped((current) => new Set(current).add(routine.id))} /> : null;
  const centre = (
    <>
      {gps}
      {routinePrompt}
      {notices}
    </>
  );

  return (
    <div className="safe-pad pointer-events-none absolute inset-0 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="pointer-events-auto flex min-w-0 flex-col items-start gap-2">
          <ClockCard clock={data.clock} date={data.date} hour={data.hour} weather={data.weather} place={data.place} />
          <VitalsPanel needs={data.needs} mood={data.mood} health={data.health} />
        </div>
        {wide && <div className="pointer-events-auto flex max-w-md flex-1 flex-col gap-2 empty:hidden">{centre}</div>}
        <div className="pointer-events-auto flex shrink-0 flex-col items-end gap-2">
          <WalletChip balance={data.snapshot.wallet.balance} />
          {tray && <div className="flex flex-col items-end gap-2">{tray}</div>}
          {!wide && outdoorMap}
        </div>
      </div>

      {!wide && <div className="pointer-events-auto mt-2 flex flex-col gap-2 empty:hidden">{centre}</div>}

      <div className={cn('mt-auto flex items-end justify-between gap-3', flip && 'flex-row-reverse')}>
        <div
          className={cn('pointer-events-auto flex min-w-0 flex-col gap-2', flip ? 'items-end' : 'items-start', inside && !phoneOpen && 'mb-[4.75rem] lg:mb-0')}
          style={contextLift > 0 ? { marginBottom: Math.max(contextLift, inside && !phoneOpen ? SHEET_LIFT_PX : 0) } : undefined}
        >
          {wide && !flip && outdoorMap}
          {!drive && !thumbZoneBusy && <SuggestionChips suggestions={chips} max={wide ? 3 : 2} />}
          {showActivity && data.segment && (
            <ActivityBanner
              segment={data.segment}
              action={data.action}
              minute={data.minute}
              cancelling={cancel.isPending}
              onCancel={() =>
                cancel.mutate(undefined, {
                  onError: (error) => toast({ title: 'Couldn’t stop that', body: errorMessage(error), tone: 'bad' }),
                })
              }
            />
          )}
        </div>
        <div className={cn('pointer-events-auto flex flex-col gap-2', flip ? 'items-start' : 'items-end')}>
          {wide && flip && outdoorMap}
          {drive && <DrivePanel drive={drive} />}
          {nearby && <ContextActions nearby={nearby} alignStart={flip} />}
          {!phoneOpen && (
            <button
              type="button"
              onClick={() => {
                gameEvents.emit('sfx', { id: 'ui-open' });
                openPhone('home');
              }}
              className="relative grid size-16 place-items-center rounded-[20px] bg-danfo text-ink shadow-[0_4px_0_var(--color-danfo-deep)] active:translate-y-0.5"
              aria-label={unreadDms > 0 ? `Open phone (${unreadDms} unread messages)` : 'Open phone'}
            >
              <Smartphone size={28} aria-hidden strokeWidth={2.4} />
              {unreadDms > 0 && (
                <span aria-hidden className="absolute -right-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-okada px-1 text-xs font-bold text-white ring-2 ring-ink">
                  {Math.min(99, unreadDms)}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
