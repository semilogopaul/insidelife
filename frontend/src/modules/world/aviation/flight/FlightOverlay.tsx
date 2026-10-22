'use client';

import { useEffect, useState } from 'react';
import type { AircraftClass } from '../contract';
import { PHASE_CAPTION, phaseStarts, type FlightPhase } from './flight-timeline';

export interface FlightOverlayProps {
  readonly cls: AircraftClass;
  readonly durationMs: number;
  /** "Lagos" / "Abuja" captions, optional. */
  readonly from?: string;
  readonly to?: string;
  readonly onSkip: () => void;
}

const PHASE_ORDER: readonly FlightPhase[] = ['takeoff', 'climb', 'cruise', 'descent', 'landing'];

/**
 * The DOM half of the flight: a caption per phase, a progress bar (a CSS transition, no per-frame work) and a Skip
 * button (also Escape, Space or Enter). Re-renders only when the phase changes.
 */
export function FlightOverlay({ cls, durationMs, from, to, onSkip }: FlightOverlayProps) {
  const [phase, setPhase] = useState<FlightPhase>('takeoff');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const starts = phaseStarts(cls);
    const timers = PHASE_ORDER.map((candidate) => window.setTimeout(() => setPhase(candidate), starts[candidate] * durationMs));
    // Next frame, so the bar transitions from empty to full.
    const frame = window.requestAnimationFrame(() => setRunning(true));
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [cls, durationMs]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code === 'Escape' || event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);

  const route = from && to ? `${from} → ${to}` : null;
  return (
    // Clear of the notch / Dynamic Island and the home indicator, so Skip can be tapped on a phone.
    <div
      className="pointer-events-none absolute inset-0 flex flex-col justify-between pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] text-white"
      style={{ position: 'absolute', inset: 0, color: '#fff' }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-xl bg-black/40 px-3 py-2 backdrop-blur-sm">
          <p className="text-lg font-bold leading-tight">{PHASE_CAPTION[phase]}</p>
          {route && <p className="text-sm opacity-80">{route}</p>}
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="pointer-events-auto min-h-11 rounded-xl bg-black/50 px-4 text-sm font-semibold backdrop-blur-sm transition hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Skip
        </button>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/25" aria-hidden>
        <div className="h-full rounded-full bg-white" style={{ width: running ? '100%' : '0%', transition: `width ${durationMs}ms linear` }} />
      </div>
    </div>
  );
}
