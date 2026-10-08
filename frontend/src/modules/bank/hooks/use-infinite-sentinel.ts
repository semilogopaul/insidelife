'use client';

import { useEffect, useRef } from 'react';

/**
 * Calls `onReach` when the returned sentinel scrolls into view (works inside the phone's own scroll area because
 * IntersectionObserver accounts for clipping ancestors).
 */
export function useInfiniteSentinel<T extends HTMLElement>(onReach: () => void, enabled: boolean) {
  const ref = useRef<T>(null);
  const latest = useRef(onReach);
  useEffect(() => {
    latest.current = onReach;
  });
  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) latest.current();
    }, { rootMargin: '240px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);
  return ref;
}
