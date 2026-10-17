'use client';

import type { CityId } from '@insidelife/shared';
import { useSnapshot } from '@/common/game/snapshot';

/** The city the player is in (Lagos until a session says otherwise): the one whose signs the world keeps in memory. */
export function useWorldCity(): CityId {
  const { data: snapshot } = useSnapshot();
  return snapshot?.character.cityId ?? 'lagos';
}
