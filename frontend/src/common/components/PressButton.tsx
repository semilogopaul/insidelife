'use client';

import { useRef, type ButtonHTMLAttributes, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { cn } from '@/common/utils/cn';

/** A release this far (CSS px) outside the button still counts: thumbs roll. */
const RELEASE_SLOP_PX = 12;
/** After a pointer press, the browser's own `click` (if it sends one) is ignored for this long. */
const CLICK_SUPPRESS_MS = 600;

export interface PressButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'> {
  /** Called once per press (pointer, keyboard or assistive tech). */
  readonly onPress: () => void;
  /** `up` (default): on release over the button, like a click. `down`: the moment it's touched (a horn). */
  readonly pressOn?: 'down' | 'up';
}

/**
 * A button that works with several fingers on the screen. Browsers only synthesise `click` for a single-finger tap,
 * so a button that listens to `click` does nothing while the other thumb holds the gas pedal (the horn, "Get out",
 * "Park & enter…"). This one acts on pointer events (any finger, mouse or pen), and still on `click` from the
 * keyboard (Enter/Space) and screen readers, never twice for one press.
 */
export function PressButton({ onPress, pressOn = 'up', className, disabled, onPointerDown, onPointerUp, onPointerCancel, onLostPointerCapture, ...rest }: PressButtonProps) {
  const pointer = useRef<number | null>(null);
  const suppressClickUntil = useRef(0);

  const release = (element: HTMLButtonElement): void => {
    pointer.current = null;
    delete element.dataset.pressed;
    suppressClickUntil.current = performance.now() + CLICK_SUPPRESS_MS;
  };

  const down = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    onPointerDown?.(event);
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0) || pointer.current !== null) return;
    pointer.current = event.pointerId;
    suppressClickUntil.current = Number.POSITIVE_INFINITY;
    event.currentTarget.dataset.pressed = 'true';
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events (tests) have no active pointer to capture.
    }
    if (pressOn === 'down') onPress();
  };

  const up = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    onPointerUp?.(event);
    if (pointer.current !== event.pointerId) return;
    const element = event.currentTarget;
    release(element);
    if (pressOn !== 'up' || disabled) return;
    const rect = element.getBoundingClientRect();
    const inside =
      rect.width === 0 ||
      (event.clientX >= rect.left - RELEASE_SLOP_PX &&
        event.clientX <= rect.right + RELEASE_SLOP_PX &&
        event.clientY >= rect.top - RELEASE_SLOP_PX &&
        event.clientY <= rect.bottom + RELEASE_SLOP_PX);
    if (inside) onPress();
  };

  const cancel = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.type === 'pointercancel') onPointerCancel?.(event);
    else onLostPointerCapture?.(event);
    if (pointer.current === event.pointerId) release(event.currentTarget);
  };

  const click = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    // A pointer press already acted (or chose not to): this is the browser's echo of it.
    if (performance.now() < suppressClickUntil.current) return;
    if (disabled) return;
    event.preventDefault();
    onPress();
  };

  return (
    <button
      {...rest}
      type="button"
      disabled={disabled}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onClick={click}
      onContextMenu={(event) => event.preventDefault()}
      className={cn('touch-none select-none [-webkit-touch-callout:none]', className)}
    />
  );
}
