'use client';

import { useEffect, useRef } from 'react';

interface EscapeLayer {
  readonly id: number;
  readonly onEscape: () => void;
}

const layers: EscapeLayer[] = [];
let nextId = 0;

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const top = layers.at(-1);
  if (!top) return;
  event.preventDefault();
  top.onEscape();
}

/**
 * Escape closes only the topmost open layer: a sheet over the phone closes the sheet, not the phone. Layers register
 * while `active` (the most recently activated is on top). Pass a no-op to make a layer swallow Escape without closing
 * (e.g. a life event that requires a choice).
 */
export function useEscapeLayer(active: boolean, onEscape: () => void): void {
  const handler = useRef(onEscape);
  useEffect(() => {
    handler.current = onEscape;
  });

  useEffect(() => {
    if (!active) return;
    const layer: EscapeLayer = { id: nextId++, onEscape: () => handler.current() };
    if (layers.length === 0) window.addEventListener('keydown', onKeyDown);
    layers.push(layer);
    return () => {
      const index = layers.findIndex((candidate) => candidate.id === layer.id);
      if (index >= 0) layers.splice(index, 1);
      if (layers.length === 0) window.removeEventListener('keydown', onKeyDown);
    };
  }, [active]);
}
