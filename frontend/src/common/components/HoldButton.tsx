'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/common/utils/cn';

export interface HoldButtonProps {
  readonly onConfirm: () => void;
  readonly children: ReactNode;
  readonly holdMs?: number;
  readonly disabled?: boolean;
  readonly className?: string;
}

/**
 * Press-and-hold to confirm irreversible money actions (send money, buy land). Keyboard: hold Enter/Space, or press
 * twice within 2 s. The fill shows progress; releasing early cancels.
 */
export function HoldButton({ onConfirm, children, holdMs = 900, disabled, className }: HoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);
  const started = useRef<number | null>(null);
  const armedAt = useRef<number>(0);

  const stop = (): void => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    started.current = null;
    setProgress(0);
  };

  const tick = (now: number): void => {
    if (started.current === null) started.current = now;
    const ratio = Math.min(1, (now - started.current) / holdMs);
    setProgress(ratio);
    if (ratio >= 1) {
      stop();
      onConfirm();
      return;
    }
    frame.current = requestAnimationFrame(tick);
  };

  const start = (): void => {
    if (disabled || frame.current !== null) return;
    frame.current = requestAnimationFrame(tick);
  };

  useEffect(() => stop, []);

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        const now = Date.now();
        if (now - armedAt.current < 2_000) {
          armedAt.current = 0;
          onConfirm();
        } else {
          armedAt.current = now;
        }
      }}
      className={cn('relative h-14 w-full select-none overflow-hidden rounded-card bg-ink font-bold text-on-ink disabled:opacity-50', className)}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 bg-danfo" style={{ width: `${progress * 100}%` }} />
      <span className={cn('relative', progress > 0.5 && 'text-ink')}>
        {children}
        <span className="sr-only"> (press and hold, or press Enter twice, to confirm)</span>
      </span>
    </button>
  );
}
