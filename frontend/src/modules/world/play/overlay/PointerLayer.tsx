'use client';

import { useEffect, useRef, useState } from 'react';
import { useUi, type StickSide } from '@/common/game/ui-store';
import { cn } from '@/common/utils/cn';
import { controls, pushTap } from '../input/controls';

/** Stick travel (px) for full deflection; pushing past it breaks into a jog. */
const STICK_RADIUS = 52;
const TAP_SLOP = 9;
const TAP_MS = 380;
const TOUCH_LOOK_GAIN = 1.35;

interface Gesture {
  readonly id: number;
  readonly kind: 'stick' | 'look';
  readonly touch: boolean;
  readonly startX: number;
  readonly startY: number;
  /** Where the stick's base is drawn (kept clear of the bottom reserve); the knob moves relative to it. */
  readonly baseX: number;
  readonly baseY: number;
  readonly startAt: number;
  lastX: number;
  lastY: number;
  moved: number;
}

/** Share of the screen width, from the stick's edge, where a touch grabs the walking stick. */
const STICK_ZONE = 0.45;

/** Does a touch at `x` (px from the left of a `width`-wide surface) grab the stick on `side`? The rest looks around. */
export function inStickZone(side: StickSide, x: number, width: number): boolean {
  return side === 'left' ? x < width * STICK_ZONE : x > width * (1 - STICK_ZONE);
}

/**
 * The input surface over the canvas (below the HUD, which keeps its own buttons): drag to orbit the camera, wheel or
 * pinch to zoom, tap to pick billboards and players. On touch while walking, one side (the player's `walkStick`
 * setting, right by default) is a floating joystick (it appears under your thumb; push it to the edge to jog) and the
 * other side looks around.
 */
export interface PointerLayerProps {
  readonly walking: boolean;
  readonly touchUi: boolean;
  /** Pixels at the bottom the stick must not cover (the venue sheet indoors). */
  readonly reserveBottom?: number;
  /** Extra classes for the "drag to walk" hint (e.g. a darker disc over light floors). */
  readonly hintClassName?: string;
}

export function PointerLayer({ walking, touchUi, reserveBottom = 0, hintClassName }: PointerLayerProps) {
  const surface = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const gestures = useRef(new Map<number, Gesture>());
  const pinch = useRef<number | null>(null);
  const walkingRef = useRef(walking);
  const side = useUi((state) => state.settings.walkStick);
  const sideRef = useRef(side);
  // Pixels at the bottom the stick's base must not cover (e.g. the venue sheet indoors).
  const reserveRef = useRef(reserveBottom);
  // The stick's resting ring is always there on touch screens while you can walk (clean screen too): it says
  // "Drag to walk" for a few seconds when you arrive (until you first use it), then stays as a faint ring. It fades
  // while your thumb holds the stick (the stick itself shows where it is).
  const rest = useRef<HTMLDivElement>(null);
  const [fresh, setFresh] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setFresh(false), 9000);
    return () => window.clearTimeout(id);
  }, []);
  const hideHint = useRef(() => setFresh(false)).current;
  useEffect(() => {
    walkingRef.current = walking;
    reserveRef.current = reserveBottom;
    sideRef.current = side;
    if (!walking) releaseStick();
  });

  const showStick = (x: number, y: number, kx: number, ky: number): void => {
    const b = base.current;
    const k = knob.current;
    if (!b || !k) return;
    b.style.opacity = '1';
    if (rest.current) rest.current.style.opacity = '0';
    b.style.transform = `translate(${x - 60}px, ${y - 60}px)`;
    k.style.opacity = '1';
    k.style.transform = `translate(${kx - 26}px, ${ky - 26}px)`;
  };

  function releaseStick(): void {
    controls.stickX = 0;
    controls.stickY = 0;
    controls.run = false;
    if (base.current) base.current.style.opacity = '0';
    if (knob.current) knob.current.style.opacity = '0';
    if (rest.current) rest.current.style.opacity = '';
  }

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const map = gestures.current;

    const pinchDistance = (): number | null => {
      const touches = [...map.values()].filter((gesture) => gesture.touch && gesture.kind === 'look');
      if (touches.length < 2) return null;
      const [a, b] = touches as [Gesture, Gesture];
      return Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY);
    };

    const onDown = (event: PointerEvent): void => {
      if (event.button > 2) return;
      const touch = event.pointerType === 'touch';
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const stickTaken = [...map.values()].some((gesture) => gesture.kind === 'stick');
      const kind: Gesture['kind'] = touch && walkingRef.current && !stickTaken && inStickZone(sideRef.current, x, rect.width) ? 'stick' : 'look';
      const y = event.clientY - rect.top;
      const baseY = reserveRef.current > 0 ? Math.min(y, rect.height - reserveRef.current - 62) : y;
      map.set(event.pointerId, { id: event.pointerId, kind, touch, startX: event.clientX, startY: event.clientY, baseX: x, baseY, startAt: performance.now(), lastX: event.clientX, lastY: event.clientY, moved: 0 });
      element.setPointerCapture(event.pointerId);
      if (kind === 'stick') {
        showStick(x, baseY, x, baseY);
        hideHint();
      }
      pinch.current = pinchDistance();
      event.preventDefault();
    };

    const onMove = (event: PointerEvent): void => {
      const gesture = map.get(event.pointerId);
      if (event.pointerType === 'mouse') {
        // A resting mouse points at things (hover highlights); dragging looks around instead.
        const rect = element.getBoundingClientRect();
        controls.hover = gesture
          ? null
          : { x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: -((event.clientY - rect.top) / rect.height) * 2 + 1 };
      }
      if (!gesture) return;
      const dx = event.clientX - gesture.lastX;
      const dy = event.clientY - gesture.lastY;
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      gesture.moved = Math.max(gesture.moved, Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY));
      if (gesture.kind === 'stick') {
        const ox = event.clientX - gesture.startX;
        const oy = event.clientY - gesture.startY;
        const length = Math.hypot(ox, oy);
        const scale = length > STICK_RADIUS ? STICK_RADIUS / length : 1;
        controls.stickX = (ox * scale) / STICK_RADIUS;
        controls.stickY = (-oy * scale) / STICK_RADIUS;
        controls.run = length > STICK_RADIUS * 1.35;
        showStick(gesture.baseX, gesture.baseY, gesture.baseX + ox * scale, gesture.baseY + oy * scale);
        return;
      }
      const distance = pinchDistance();
      if (distance !== null && pinch.current !== null) {
        controls.zoom -= (distance - pinch.current) / 40;
        pinch.current = distance;
        controls.lastLookAt = performance.now();
        return;
      }
      if (gesture.moved < TAP_SLOP && gesture.touch) return;
      const gain = gesture.touch ? TOUCH_LOOK_GAIN : 1;
      controls.lookX += dx * gain;
      controls.lookY += dy * gain;
      controls.lastLookAt = performance.now();
    };

    const onUp = (event: PointerEvent): void => {
      const gesture = map.get(event.pointerId);
      if (!gesture) return;
      map.delete(event.pointerId);
      if (gesture.kind === 'stick') releaseStick();
      // A quick touch that didn't move is a tap, on the stick's side too (tapping the bar on the right of the screen).
      if (event.type === 'pointerup' && gesture.moved < TAP_SLOP && performance.now() - gesture.startAt < TAP_MS && map.size === 0) {
        const rect = element.getBoundingClientRect();
        pushTap(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      }
      pinch.current = pinchDistance();
    };

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      controls.zoom += Math.max(-3, Math.min(3, event.deltaY / 100));
      controls.lastLookAt = performance.now();
    };
    const onContext = (event: Event): void => event.preventDefault();
    const onLeave = (): void => {
      controls.hover = null;
    };

    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('contextmenu', onContext);
    element.addEventListener('pointerleave', onLeave);
    return () => {
      element.removeEventListener('pointerleave', onLeave);
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('contextmenu', onContext);
      map.clear();
      releaseStick();
    };
  }, [hideHint]);

  return (
    <div ref={surface} className="absolute inset-0 touch-none select-none" aria-hidden data-testid="play-surface">
      {touchUi && walking && (
        <div
          ref={rest}
          data-testid="stick-hint"
          data-tour="stick-ring"
          data-side={side}
          data-fresh={fresh ? 'true' : undefined}
          className={cn(
            'pointer-events-none absolute bottom-[max(env(safe-area-inset-bottom),1rem)] grid size-[120px] place-items-center rounded-full border-2 transition-opacity duration-300',
            fresh ? 'border-white/25 bg-ink/15' : 'border-white/20 bg-ink/10 opacity-70',
            side === 'left' ? 'left-[max(env(safe-area-inset-left),1rem)]' : 'right-[max(env(safe-area-inset-right),1rem)]',
            hintClassName,
          )}
          style={reserveBottom > 0 ? { bottom: `calc(max(env(safe-area-inset-bottom), 1rem) + ${reserveBottom}px)` } : undefined}
        >
          {fresh ? (
            <span className="text-center text-2xs font-bold uppercase tracking-wide text-white/60">
              Drag
              <br />
              to walk
            </span>
          ) : (
            <span className="size-[44px] rounded-full border-2 border-white/25" />
          )}
        </div>
      )}
      <div ref={base} className="pointer-events-none absolute left-0 top-0 size-[120px] rounded-full border-2 border-white/40 bg-ink/25 opacity-0 transition-opacity duration-150" />
      <div ref={knob} className="pointer-events-none absolute left-0 top-0 size-[52px] rounded-full bg-danfo/90 opacity-0 shadow-[var(--shadow-glass)]" />
    </div>
  );
}
