'use client';

import { ArrowBigLeft, ArrowBigRight, DoorOpen, Megaphone } from 'lucide-react';
import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { PressButton } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { cn } from '@/common/utils/cn';
import { controls } from '../input/controls';
import { usePlayUi } from '../state/play-ui-store';

type Axis = 'left' | 'right' | 'gas' | 'brake';

function applyHeld(held: ReadonlyMap<number, Axis>): void {
  const axes = new Set(held.values());
  controls.touchSteer = (axes.has('right') ? 1 : 0) - (axes.has('left') ? 1 : 0);
  controls.touchGas = axes.has('gas') ? 1 : 0;
  controls.touchBrake = axes.has('brake') ? 1 : 0;
}

/**
 * A hold control (steering, pedals): held while any finger is on it. Fingers are tracked by pointer id, so two
 * thumbs on two controls (steer while on the gas) never release each other, and lifting one finger of two on the
 * same pedal keeps it held.
 */
function Pedal({ axis, held, label, className, children }: { readonly axis: Axis; readonly held: Map<number, Axis>; readonly label: string; readonly className: string; readonly children: ReactNode }) {
  const press = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events (tests) have no active pointer to capture.
    }
    held.set(event.pointerId, axis);
    applyHeld(held);
    event.currentTarget.dataset.held = 'true';
  };
  const release = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (held.get(event.pointerId) !== axis) return;
    held.delete(event.pointerId);
    applyHeld(held);
    if (![...held.values()].includes(axis)) delete event.currentTarget.dataset.held;
  };
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        'pointer-events-auto grid touch-none select-none place-items-center font-bold shadow-[var(--shadow-glass)] transition-transform duration-75 [-webkit-touch-callout:none] data-[held=true]:scale-95',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Thumb controls while driving on touch screens: steer left/right with the walking thumb (the `walkStick` side, right
 * by default), gas and brake/reverse with the other one (above the HUD's phone button, which sits on that side),
 * plus the horn and "Get out" over the steering. The horn and "Get out" act on pointer events, so they work while
 * the other thumb is on a pedal (a second finger never produces a `click`). Stopped at a door (or a filling station or
 * mechanic) the offer ("Park & enter …") sits above them, so it works with the HUD hidden (clean screen) too.
 */
export function DriveControls() {
  const [held] = useState(() => new Map<number, Axis>());
  const side = useUi((state) => state.settings.walkStick);
  const phoneOpen = useUi((state) => state.phoneOpen);
  const offer = usePlayUi((state) => state.driveOffer);
  const steerLeft = side === 'left';
  // Nothing stays held when the phone covers the controls or they go away (got out, went inside).
  useEffect(() => {
    if (!phoneOpen) return;
    held.clear();
    applyHeld(held);
  }, [held, phoneOpen]);
  useEffect(
    () => () => {
      held.clear();
      applyHeld(held);
    },
    [held],
  );
  // The HUD keeps the bottom corners (activity banner and goals on the stick side; speedometer, context button and
  // phone on the other), so the thumb clusters sit just above them.
  return (
    <div data-testid="drive-controls" data-stick={side} className="pointer-events-none absolute inset-0">
      <div
        data-testid="steering"
        className={cn(
          'pointer-events-none absolute bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+7.5rem)] flex flex-col gap-2.5',
          steerLeft ? 'left-[max(env(safe-area-inset-left),0.75rem)] items-start' : 'right-[max(env(safe-area-inset-right),0.75rem)] items-end',
        )}
      >
        {offer && (
          <PressButton
            data-testid="drive-offer"
            aria-disabled={offer.disabled ? true : undefined}
            onPress={() => gameEvents.emit('interact', { interactableId: offer.id })}
            className="pointer-events-auto flex min-h-14 max-w-[min(17rem,calc(100vw-7.5rem))] items-center gap-2 rounded-card bg-paper px-4 py-1.5 text-left text-sm font-bold text-ink shadow-[var(--shadow-lift)] transition-transform duration-75 data-[pressed=true]:scale-95"
          >
            {offer.emoji && <span aria-hidden>{offer.emoji}</span>}
            <span className="min-w-0">
              <span className="block truncate">{offer.label}</span>
              {offer.disabled && <span className="block truncate text-xs text-text-soft">{offer.disabled}</span>}
            </span>
          </PressButton>
        )}
        <div className="flex gap-2.5">
          <PressButton
            pressOn="down"
            onPress={() => gameEvents.emit('sfx', { id: 'horn' })}
            className="pointer-events-auto grid size-14 place-items-center rounded-full bg-ink/70 text-on-ink shadow-[var(--shadow-glass)] backdrop-blur transition-transform duration-75 data-[pressed=true]:scale-90 data-[pressed=true]:bg-danfo data-[pressed=true]:text-ink"
            aria-label="Horn"
          >
            <Megaphone size={22} aria-hidden />
          </PressButton>
          <PressButton
            onPress={() => gameEvents.emit('exit-car', {})}
            className="pointer-events-auto flex h-14 items-center gap-1.5 rounded-full bg-ink/70 px-4 text-sm font-bold text-on-ink shadow-[var(--shadow-glass)] backdrop-blur transition-transform duration-75 data-[pressed=true]:scale-95"
          >
            <DoorOpen size={18} aria-hidden />
            Get out
          </PressButton>
        </div>
        <div className="flex gap-2.5">
          <Pedal axis="left" held={held} label="Steer left" className="size-[76px] rounded-[22px] bg-ink/70 text-on-ink backdrop-blur">
            <ArrowBigLeft size={38} aria-hidden />
          </Pedal>
          <Pedal axis="right" held={held} label="Steer right" className="size-[76px] rounded-[22px] bg-ink/70 text-on-ink backdrop-blur">
            <ArrowBigRight size={38} aria-hidden />
          </Pedal>
        </div>
      </div>
      <div
        data-testid="pedals"
        className={cn(
          'pointer-events-none absolute bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+13.25rem)] flex flex-col items-center gap-2.5',
          steerLeft ? 'right-[max(env(safe-area-inset-right),0.75rem)]' : 'left-[max(env(safe-area-inset-left),0.75rem)]',
        )}
      >
        <Pedal axis="brake" held={held} label="Brake / reverse" className="h-[60px] w-[78px] rounded-[18px] bg-okada text-sm uppercase tracking-wide text-white">
          Brake
        </Pedal>
        <Pedal axis="gas" held={held} label="Accelerate" className="h-[96px] w-[78px] rounded-[22px] bg-danfo text-sm uppercase tracking-wide text-ink shadow-[0_4px_0_var(--color-danfo-deep)]">
          Gas
        </Pedal>
      </div>
    </div>
  );
}
