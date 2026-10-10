'use client';

import { Eye, EyeOff, Smartphone } from 'lucide-react';
import { useUnreadDms } from '@/common/chat';
import { useState, type ReactNode } from 'react';
import type { CharacterSnapshotDto } from '@insidelife/shared';
import { api } from '@/common/api/http';
import { errorMessage } from '@/common/api/api-error';
import { PressButton, toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useNavigation } from '@/common/game/navigation-store';
import { useSnapshotMutation } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useWorld, type Interactable } from '@/common/game/world-store';
import { useMediaQuery } from '@/common/hooks/use-media-query';
import { useStickSide } from '@/common/hooks/use-touch-ui';
import { cn } from '@/common/utils/cn';
import { toggleHud, useAutoShowHud, useHudKeys } from '../hooks/use-clean-screen';
import { useHudData } from '../hooks/use-hud-data';
import { useSuggestions } from '../hooks/use-suggestions';
import { isRoutineDue } from '../services/suggestions';
import { ActivityBanner } from './ActivityBanner';
import { ClockCard } from './ClockCard';
import { DriveAlert } from './DriveAlert';
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
  /**
   * The Talk button (say something out loud to people nearby), from the talk feature. It sits just above the phone
   * button; hidden while steering on a touch screen (both thumbs are on the car's controls there).
   */
  readonly talk?: ReactNode;
  /** What people nearby just said (the talk feature's brief feed), under the needs panel. */
  readonly feed?: ReactNode;
}

/** Phones: the context button's bottom edge sits this high (phone button + gaps) and is this tall; options add more. */
const CONTEXT_BASE_PX = 64 + 8 + 48 + 8;
const CONTEXT_OPTION_PX = 46;
/** The Talk button above the phone button (height + gap). */
const TALK_PX = 48 + 8;
/** Inside: the suggestions clear the collapsed venue sheet. */
const SHEET_LIFT_PX = 76;

/**
 * The context button (and, at a hotspot with several things to do, the others as smaller buttons above it, keys 1–4).
 * Something that can't be done right now stays visible, greyed out with the reason; pressing it explains. They act on
 * pointer release (`PressButton`), so "Park & enter …" works while the other thumb is still on the brake.
 */
function ContextActions({ nearby, alignStart }: { readonly nearby: Interactable; readonly alignStart: boolean }) {
  return (
    <div className={cn('flex flex-col gap-1.5', alignStart ? 'items-start' : 'items-end')} data-testid="context-actions" data-tour="context-action">
      {nearby.more?.map((option, index) => (
        <PressButton
          key={option.id}
          aria-disabled={option.disabled ? true : undefined}
          aria-label={option.disabled ? `${option.label}. Not now: ${option.disabled}` : undefined}
          onPress={() => gameEvents.emit('interact', { interactableId: option.id })}
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
        </PressButton>
      ))}
      <PressButton
        aria-disabled={nearby.disabled ? true : undefined}
        aria-label={nearby.disabled ? `${nearby.label}. Not now: ${nearby.disabled}` : undefined}
        onPress={() => gameEvents.emit('interact', { interactableId: nearby.id })}
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
      </PressButton>
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
export function Hud({ tray, map, notices, talk, feed }: HudProps) {
  const data = useHudData();
  const hidden = useUi((state) => state.settings.hudHidden);
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
  const stickSide = useStickSide();
  const flip = stickSide === 'right';
  const inside = data?.inside === true;
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const cancel = useSnapshotMutation(() => api.delete<CharacterSnapshotDto>('/characters/me/actions/current'));
  useHudKeys();
  useAutoShowHud();

  if (hidden) return <CleanScreen />;
  if (!data) return null;
  // Touch screens at the wheel: the drive controls own both thumbs, so Talk waits until you stop and get out.
  const talkButton = talk && !phoneOpen && !(stickSide !== null && mode === 'driving') ? talk : null;
  // On phones a long context button ("🍹 Drinks at the lounge · ₦18,000", options above it) shares no row with the
  // suggestions: they lift above it.
  const contextLift = !wide && nearby ? CONTEXT_BASE_PX + (talkButton ? TALK_PX : 0) + (nearby.disabled ? 14 : 0) + (nearby.more?.length ?? 0) * CONTEXT_OPTION_PX : 0;
  // On phones the stick's corner is the walking/steering thumb zone: keep it clear while moving around outside.
  const thumbZoneBusy = !wide && (mode === 'walking' || mode === 'driving');
  // Out on the street the planned timeline runs ahead of you (the commute you're not taking): on phones only an
  // action you chose yourself may sit in the stick's corner, never over the steering or the walking thumb.
  const showActivity =
    data.segment &&
    (data.segment.kind === 'action' || data.segment.kind === 'commute' || data.segment.kind === 'work' || data.segment.kind === 'lecture' || data.segment.kind === 'sleep') &&
    !(thumbZoneBusy && (data.segment.kind !== 'action' || data.action?.id === 'explore'));

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
      {drive?.warning && <DriveAlert warning={drive.warning} />}
      {gps}
      {routinePrompt}
      {notices}
    </>
  );

  return (
    <div className="safe-pad pointer-events-none absolute inset-0 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <div className="pointer-events-auto flex flex-col items-start gap-2">
            <ClockCard clock={data.clock} date={data.date} hour={data.hour} weather={data.weather} place={data.place} />
            <VitalsPanel needs={data.needs} mood={data.mood} health={data.health} />
          </div>
          {/* Read-only: taps go through to the world. */}
          {feed && !phoneOpen ? feed : null}
        </div>
        {wide && <div className="pointer-events-auto flex max-w-md flex-1 flex-col gap-2 empty:hidden">{centre}</div>}
        {/* The column is as wide as its widest row: only its controls take taps, the gaps go through to the world. */}
        <div className="pointer-events-none flex shrink-0 flex-col items-end gap-2">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleHud}
              aria-label="Hide the HUD (clean screen)"
              aria-keyshortcuts="H"
              data-tour="hud-hide"
              title="Clean screen (H)"
              className="glass grid size-11 place-items-center rounded-full text-on-ink-soft hover:text-on-ink"
            >
              <EyeOff size={18} aria-hidden />
            </button>
            <WalletChip balance={data.snapshot.wallet.balance} />
          </div>
          {tray && <div className="pointer-events-none flex flex-col items-end gap-2 *:pointer-events-auto">{tray}</div>}
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
          {talkButton}
          {!phoneOpen && (
            <button
              type="button"
              onClick={() => {
                gameEvents.emit('sfx', { id: 'ui-open' });
                openPhone('home');
              }}
              data-tour="phone-button"
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

/**
 * The HUD hidden for an unobstructed view: only a small Show button stays (top-right, where the hide button was).
 * Movement controls, name tags, speech bubbles, toasts and alerts are other layers and keep showing.
 */
function CleanScreen() {
  return (
    <div className="safe-pad pointer-events-none absolute inset-0 flex items-start justify-end">
      <button
        type="button"
        onClick={toggleHud}
        aria-label="Show the HUD"
        aria-keyshortcuts="H"
        data-tour="hud-show"
        title="Show the HUD (H)"
        className="glass pointer-events-auto flex h-11 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-on-ink opacity-70 hover:opacity-100 focus-visible:opacity-100"
      >
        <Eye size={16} aria-hidden />
        Show
      </button>
    </div>
  );
}
