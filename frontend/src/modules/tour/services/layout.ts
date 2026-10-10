export interface Box {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface CardPlacement {
  readonly mode: 'centred' | 'below' | 'above';
  readonly top: number;
  readonly left: number;
  readonly width: number;
}

const MARGIN = 12;
const GAP = 14;

/** Where the tooltip card goes: under or over the target when there's room, otherwise centred on the screen. */
export function placeCard(target: Box | null, viewport: { readonly width: number; readonly height: number }, cardHeight: number): CardPlacement {
  const width = Math.min(352, viewport.width - MARGIN * 2);
  const centredLeft = Math.round((viewport.width - width) / 2);
  const centred: CardPlacement = { mode: 'centred', top: Math.max(MARGIN, Math.round((viewport.height - cardHeight) / 2)), left: centredLeft, width };
  if (!target) return centred;
  const left = Math.min(Math.max(MARGIN, Math.round(target.left + target.width / 2 - width / 2)), viewport.width - width - MARGIN);
  const below = target.top + target.height + GAP;
  if (below + cardHeight + MARGIN <= viewport.height) return { mode: 'below', top: below, left, width };
  const above = target.top - GAP - cardHeight;
  if (above >= MARGIN) return { mode: 'above', top: above, left, width };
  return centred;
}

/** A target counts as on screen when it has a size and sits at least partly inside the viewport. */
export function isOnScreen(box: Box, viewport: { readonly width: number; readonly height: number }): boolean {
  return box.width > 0 && box.height > 0 && box.top < viewport.height && box.top + box.height > 0 && box.left < viewport.width && box.left + box.width > 0;
}
