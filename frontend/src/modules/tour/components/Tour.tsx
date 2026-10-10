'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/common/components';
import { useTour, type TourController } from '../hooks/use-tour';
import { useTarget } from '../hooks/use-target';
import { placeCard } from '../services/layout';

/** Mounted once in the game root: the coach-mark walkthrough (spotlight on the real control + a card with Back, Next, Skip). */
export function Tour() {
  const tour = useTour();
  return tour.running ? <TourCard tour={tour} /> : null;
}

const SPOT_PAD = 6;

function useViewport(): { readonly width: number; readonly height: number } {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const onResize = (): void => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

export function TourCard({ tour }: { readonly tour: TourController }) {
  const { step, index, total, context } = tour;
  const titleId = useId();
  const bodyId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(230);
  const viewport = useViewport();
  const target = useTarget(step.targets, true, step.id);
  const last = index === total - 1;
  const body = step.body(context);

  // Focus goes to the card when a step shows, and back where it was when the walkthrough ends.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => previous?.focus?.({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (target.settled) cardRef.current?.focus({ preventScroll: true });
  }, [target.settled, step.id]);
  useLayoutEffect(() => {
    if (cardRef.current && cardRef.current.offsetHeight > 0) setCardHeight(cardRef.current.offsetHeight);
  }, [step.id, target.settled, viewport.width]);

  // Esc skips (capture phase: the phone's own Esc would otherwise close the phone under us). Tab stays on the card.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        tour.skip();
        return;
      }
      if (event.key !== 'Tab' || !cardRef.current) return;
      const focusable = [...cardRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
      const first = focusable[0];
      const lastButton = focusable[focusable.length - 1];
      if (!first || !lastButton) return;
      const active = document.activeElement;
      if (!cardRef.current.contains(active) || (event.shiftKey && (active === first || active === cardRef.current))) {
        event.preventDefault();
        (event.shiftKey ? lastButton : first).focus();
      } else if (!event.shiftKey && active === lastButton) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tour]);

  const box = target.box;
  const placement = placeCard(box, viewport, cardHeight);
  const hole = box ? { x: box.left - SPOT_PAD, y: box.top - SPOT_PAD, w: box.width + SPOT_PAD * 2, h: box.height + SPOT_PAD * 2 } : null;
  const maskId = `${titleId}-mask`;

  return (
    <div className="fixed inset-0 z-[70]" data-testid="tour" data-step={step.id} data-target={box ? 'found' : target.settled ? 'missing' : 'looking'}>
      {/* The dim layer swallows taps, so nothing behind the walkthrough is pressed by accident (no purchase can happen). */}
      <svg className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            {hole && <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={14} fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" mask={`url(#${maskId})`} style={{ fill: 'var(--color-ink)', fillOpacity: 0.72 }} />
      </svg>
      {hole && <div aria-hidden className="pointer-events-none absolute rounded-[14px] ring-2 ring-danfo" style={{ top: hole.y, left: hole.x, width: hole.w, height: hole.h }} />}
      {target.settled && (
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Step ${index + 1} of ${total}: ${step.title}`}
          aria-describedby={bodyId}
          tabIndex={-1}
          data-placement={placement.mode}
          className="absolute rounded-sheet bg-paper p-4 text-text shadow-[var(--shadow-lift)] outline-none"
          style={{ top: placement.top, left: placement.left, width: placement.width }}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-text-soft tabular">
            {index + 1} of {total}
          </p>
          <h2 id={titleId} className="type-title mt-0.5 text-xl leading-tight">
            {step.title}
          </h2>
          <p id={bodyId} className="mt-1.5 text-sm leading-snug">
            {body}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-text-soft hover:bg-paper-2" onClick={tour.skip}>
              Skip
            </Button>
            <span className="flex-1" />
            {index > 0 && (
              <Button variant="paper" size="sm" onClick={tour.back}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={tour.next}>
              {last ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
