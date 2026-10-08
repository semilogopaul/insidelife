'use client';

import { useEffect, useRef, useState } from 'react';

/** Width of an element, kept current with ResizeObserver (charts render at real pixels so text never stretches). */
export function useElementWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth || fallback);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}
