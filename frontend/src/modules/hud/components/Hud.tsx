'use client';

import { Smartphone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { CharacterSnapshotDto } from '@insidelife/shared';
import { api } from '@/common/api/http';
import { errorMessage } from '@/common/api/api-error';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useNavigation } from '@/common/game/navigation-store';
import { useSnapshotMutation } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useWorld } from '@/common/game/world-store';
import { cn } from '@/common/utils/cn';
import { useHudData } from '../hooks/use-hud-data';
import { useMediaQuery } from '../hooks/use-media-query';
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
}

/**
 * In-world HUD. Top: time/place + vitals (left), GPS and routine prompts (centre), wallet + tray (right).
 * Bottom: smart suggestions + current activity (left), speed/fuel, context action and phone (right). Inside a
 * building the bottom-left stack lifts above the venue sheet so they never overlap.
 */
export function Hud({ tray, map }: HudProps) {
  const data = useHudData();
  const openPhone = useUi((state) => state.openPhone);
  const phoneOpen = useUi((state) => state.phoneOpen);
  const nearby = useWorld((state) => state.nearby);
  const drive = useWorld((state) => state.drive);
  const mode = useWorld((state) => state.mode);
  const navigation = useNavigation();
  const suggestions = useSuggestions();
  const wide = useMediaQuery('(min-width: 768px)');
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const cancel = useSnapshotMutation(() => api.delete<CharacterSnapshotDto>('/characters/me/actions/current'));

  if (!data) return null;
  // On phones the bottom-left is the walking/steering thumb zone: keep it clear while moving around outside.
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
  const centre = gps || routinePrompt ? (
    <>
      {gps}
      {routinePrompt}
    </>
  ) : null;

  return (
    <div className="safe-pad pointer-events-none absolute inset-0 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="pointer-events-auto flex flex-col items-start gap-2">
          <ClockCard clock={data.clock} date={data.date} hour={data.hour} weather={data.weather} place={data.place} />
          <VitalsPanel needs={data.needs} mood={data.mood} health={data.health} />
        </div>
        {wide && centre && <div className="pointer-events-auto flex max-w-md flex-1 flex-col gap-2">{centre}</div>}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <WalletChip balance={data.snapshot.wallet.balance} />
          {tray && <div className="flex flex-col items-end gap-2">{tray}</div>}
          {!wide && outdoorMap}
        </div>
      </div>

      {!wide && centre && <div className="pointer-events-auto mt-2 flex flex-col gap-2">{centre}</div>}

      <div className="mt-auto flex items-end justify-between gap-3">
        <div className={cn('pointer-events-auto flex min-w-0 flex-col items-start gap-2', data.inside && !phoneOpen && 'mb-[4.75rem] lg:mb-0')}>
          {wide && outdoorMap}
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
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {drive && <DrivePanel drive={drive} />}
          {nearby && (
            <button
              type="button"
              onClick={() => gameEvents.emit('interact', { interactableId: nearby.id })}
              className="h-12 rounded-card bg-paper px-4 font-bold text-ink shadow-[var(--shadow-lift)]"
            >
              {nearby.label}
              <kbd className="ml-2 rounded bg-paper-3 px-1.5 py-0.5 text-xs">E</kbd>
            </button>
          )}
          {!phoneOpen && (
            <button
              type="button"
              onClick={() => {
                gameEvents.emit('sfx', { id: 'ui-open' });
                openPhone('home');
              }}
              className="grid size-16 place-items-center rounded-[20px] bg-danfo text-ink shadow-[0_4px_0_var(--color-danfo-deep)] active:translate-y-0.5"
              aria-label="Open phone"
            >
              <Smartphone size={28} aria-hidden strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
