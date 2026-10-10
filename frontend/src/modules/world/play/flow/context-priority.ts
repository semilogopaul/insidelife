import type { Interactable } from '@/common/game/world-store';

/** One thing in range of the player, with how far away it is. */
export interface ContextCandidate {
  readonly item: Interactable;
  /** Metres. */
  readonly distance: number;
  /** A door or entrance (home, venue, your car): beats a service point. */
  readonly entrance: boolean;
}

/**
 * Most useful first: something that can be done beats something that can't, an entrance beats a service point, then
 * the nearest. A disabled card is only ever shown when nothing enabled is in range.
 */
export function rankContext(candidates: readonly ContextCandidate[]): readonly ContextCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      Number(Boolean(a.item.disabled)) - Number(Boolean(b.item.disabled)) ||
      Number(b.entrance) - Number(a.entrance) ||
      a.distance - b.distance,
  );
}

/**
 * The card to show: `choice` indexes the enabled options (wrapping), so a "next" chevron can switch between them;
 * `choices` on the result says how many there are. A disabled card shows only when it is all there is.
 */
export function pickContext(candidates: readonly ContextCandidate[], choice = 0): Interactable | null {
  const ranked = rankContext(candidates);
  const enabled = ranked.filter((c) => !c.item.disabled);
  if (enabled.length === 0) return ranked[0]?.item ?? null;
  const picked = enabled[((choice % enabled.length) + enabled.length) % enabled.length] as ContextCandidate;
  return enabled.length > 1 ? { ...picked.item, choices: enabled.length } : picked.item;
}
