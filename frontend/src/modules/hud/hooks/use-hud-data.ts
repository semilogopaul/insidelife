'use client';

import {
  findAction,
  findVenue,
  formatClock12,
  formatDate,
  isHomeLocation,
  isStreetLocation,
  toDateParts,
  weatherAt,
  type Weather,
} from '@insidelife/shared';
import { gameClock } from '@/common/game/game-clock';
import { segmentAt, useProjectedNeeds, useSnapshot } from '@/common/game/snapshot';
import { useGameMinute } from '@/common/game/use-game-clock';

/** Everything the HUD shows, derived from the snapshot + the local clock (1 Hz). */
export function useHudData() {
  const { data: snapshot } = useSnapshot();
  const minute = useGameMinute(1_000);
  const projected = useProjectedNeeds(snapshot, minute);
  if (!snapshot || !projected) return null;

  const segment = segmentAt(snapshot, minute);
  const action = segment?.actionId ? findAction(segment.actionId) : undefined;
  const parts = toDateParts(minute);
  const weather: Weather | null = gameClock.worldSeed ? weatherAt(gameClock.worldSeed, minute) : null;
  const locationId = snapshot.character.locationId;
  const place = isHomeLocation(locationId) ? 'Home' : isStreetLocation(locationId) ? 'On the streets' : (findVenue(locationId)?.name ?? 'Lagos');
  /** Inside a building: the venue sheet is showing at the bottom centre. */
  const inside = snapshot.travel === null && !isStreetLocation(locationId);
  /** Nothing chosen is running: no explicit action, not travelling. Routine prompts only bother a free player. */
  const free = snapshot.travel === null && !(segment?.explicit && (segment.kind === 'action' || segment.kind === 'travel' || segment.kind === 'commute'));

  return {
    snapshot,
    minute,
    clock: formatClock12(minute),
    date: formatDate(minute),
    hour: parts.hour + parts.minute / 60,
    weather,
    needs: projected.needs,
    mood: projected.mood,
    health: snapshot.character.health,
    segment,
    action,
    place,
    inside,
    free,
  };
}
