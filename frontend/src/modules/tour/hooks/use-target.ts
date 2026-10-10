'use client';

import { useEffect, useState } from 'react';
import { isOnScreen, type Box } from '../services/layout';

/** How long a step waits for its target (the phone slides up, an app chunk loads) before showing the card centred. */
export const TARGET_WAIT_MS = 1_400;
const POLL_MS = 120;

export interface TargetState {
  /** The highlighted element's box, or null while it isn't on screen. */
  readonly box: Box | null;
  /** The target was found, or the wait is over: the card can show (pointing at it, or centred). */
  readonly settled: boolean;
}

/** The first of `targets` (`data-tour` values) that is on screen. */
export function findTarget(targets: readonly string[], viewport: { readonly width: number; readonly height: number }): { readonly element: Element; readonly box: Box } | null {
  for (const id of targets) {
    for (const element of document.querySelectorAll(`[data-tour="${id}"]`)) {
      const rect = element.getBoundingClientRect();
      const box: Box = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
      if (isOnScreen(box, viewport)) return { element, box };
    }
  }
  return null;
}

/**
 * Follows the step's target while the step is shown (it moves as the phone slides in or the window resizes). A step
 * whose target never appears settles after a moment with no box: the card is then centred.
 */
export function useTarget(targets: readonly string[], active: boolean, stepKey: string): TargetState {
  const [state, setState] = useState<TargetState & { readonly key: string }>({ box: null, settled: false, key: stepKey });

  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    let scrolled = false;
    const measure = (): void => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const found = findTarget(targets, viewport);
      if (found && !scrolled) {
        scrolled = true;
        found.element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
      const settled = found !== null || Date.now() - startedAt >= TARGET_WAIT_MS;
      setState((current) => {
        const box = found?.box ?? null;
        const same =
          current.key === stepKey &&
          current.settled === settled &&
          ((current.box === null && box === null) || (current.box !== null && box !== null && current.box.top === box.top && current.box.left === box.left && current.box.width === box.width && current.box.height === box.height));
        return same ? current : { box, settled, key: stepKey };
      });
    };
    measure();
    const id = window.setInterval(measure, POLL_MS);
    return () => window.clearInterval(id);
  }, [targets, active, stepKey]);

  // A new step starts unsettled (no stale box from the previous one).
  return state.key === stepKey ? state : { box: null, settled: false };
}
