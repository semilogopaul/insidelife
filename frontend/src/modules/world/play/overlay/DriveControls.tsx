'use client';

import { ArrowBigLeft, ArrowBigRight, DoorOpen, Megaphone } from 'lucide-react';
import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { cn } from '@/common/utils/cn';
import { controls } from '../input/controls';

type Axis = 'left' | 'right' | 'gas' | 'brake';

function applyHeld(held: ReadonlySet<Axis>): void {
  controls.touchSteer = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
  controls.touchGas = held.has('gas') ? 1 : 0;
  controls.touchBrake = held.has('brake') ? 1 : 0;
}

function Pedal({ axis, held, label, className, children }: { readonly axis: Axis; readonly held: Set<Axis>; readonly label: string; readonly className: string; readonly children: ReactNode }) {
  const press = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    held.add(axis);
    applyHeld(held);
    event.currentTarget.dataset.held = 'true';
  };
  const release = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    held.delete(axis);
    applyHeld(held);
    delete event.currentTarget.dataset.held;
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
        'pointer-events-auto grid touch-none select-none place-items-center font-bold shadow-[var(--shadow-glass)] transition-transform duration-75 data-[held=true]:scale-95',
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
 * plus horn and get out next to the steering.
 */
export function DriveControls() {
  const [held] = useState(() => new Set<Axis>());
  const side = useUi((state) => state.settings.walkStick);
  const steerLeft = side === 'left';
  // The HUD keeps the bottom corners (activity banner and goals on the stick side; speedometer, context button and
  // phone on the other), so the thumb clusters sit just above them.
  return (
    <>
      <div
        data-testid="steering"
        className={cn(
          'pointer-events-none absolute bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+7.5rem)] flex flex-col gap-2',
          steerLeft ? 'left-[max(env(safe-area-inset-left),0.75rem)] items-start' : 'right-[max(env(safe-area-inset-right),0.75rem)] items-end',
        )}
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => gameEvents.emit('sfx', { id: 'horn' })}
            className="pointer-events-auto grid size-12 place-items-center rounded-full bg-ink/70 text-on-ink shadow-[var(--shadow-glass)] backdrop-blur"
            aria-label="Horn"
          >
            <Megaphone size={20} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => gameEvents.emit('exit-car', {})}
            className="pointer-events-auto flex h-12 items-center gap-1.5 rounded-full bg-ink/70 px-3.5 text-sm font-bold text-on-ink shadow-[var(--shadow-glass)] backdrop-blur"
          >
            <DoorOpen size={18} aria-hidden />
            Get out
          </button>
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
    </>
  );
}
