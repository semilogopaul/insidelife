'use client';

import { useEffect, useRef, useState } from 'react';
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
  readonly startAt: number;
  lastX: number;
  lastY: number;
  moved: number;
}

/**
 * The input surface over the canvas (below the HUD, which keeps its own buttons): drag to orbit the camera, wheel or
 * pinch to zoom, tap to pick billboards and players. On touch while walking, the left side is a floating joystick
 * (it appears under your thumb; push it to the edge to jog) and the right side looks around.
 */
export function PointerLayer({ walking, touchUi }: { readonly walking: boolean; readonly touchUi: boolean }) {
  const surface = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const gestures = useRef(new Map<number, Gesture>());
  const pinch = useRef<number | null>(null);
  const walkingRef = useRef(walking);
  // The "drag to walk" hint shows briefly when you step outside, until the first time you use the stick.
  const [hint, setHint] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setHint(false), 9000);
    return () => window.clearTimeout(id);
  }, []);
  const hideHint = useRef(() => setHint(false)).current;
  useEffect(() => {
    walkingRef.current = walking;
    if (!walking) releaseStick();
  });

  const showStick = (x: number, y: number, kx: number, ky: number): void => {
    const b = base.current;
    const k = knob.current;
    if (!b || !k) return;
    b.style.opacity = '1';
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
      const kind: Gesture['kind'] = touch && walkingRef.current && !stickTaken && x < rect.width * 0.45 ? 'stick' : 'look';
      map.set(event.pointerId, { id: event.pointerId, kind, touch, startX: event.clientX, startY: event.clientY, startAt: performance.now(), lastX: event.clientX, lastY: event.clientY, moved: 0 });
      element.setPointerCapture(event.pointerId);
      if (kind === 'stick') {
        showStick(x, event.clientY - rect.top, x, event.clientY - rect.top);
        hideHint();
      }
      pinch.current = pinchDistance();
      event.preventDefault();
    };

    const onMove = (event: PointerEvent): void => {
      const gesture = map.get(event.pointerId);
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
        const rect = element.getBoundingClientRect();
        showStick(gesture.startX - rect.left, gesture.startY - rect.top, gesture.startX - rect.left + ox * scale, gesture.startY - rect.top + oy * scale);
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
      else if (event.type === 'pointerup' && gesture.moved < TAP_SLOP && performance.now() - gesture.startAt < TAP_MS && map.size === 0) {
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

    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onUp);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('contextmenu', onContext);
    return () => {
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
      {touchUi && walking && hint && (
        <div className="pointer-events-none absolute bottom-[max(env(safe-area-inset-bottom),1rem)] left-[max(env(safe-area-inset-left),1rem)] grid size-[120px] place-items-center rounded-full border-2 border-white/25 bg-ink/15">
          <span className="text-center text-2xs font-bold uppercase tracking-wide text-white/60">
            Drag
            <br />
            to walk
          </span>
        </div>
      )}
      <div ref={base} className="pointer-events-none absolute left-0 top-0 size-[120px] rounded-full border-2 border-white/40 bg-ink/25 opacity-0 transition-opacity duration-150" />
      <div ref={knob} className="pointer-events-none absolute left-0 top-0 size-[52px] rounded-full bg-danfo/90 opacity-0 shadow-[var(--shadow-glass)]" />
    </div>
  );
}
