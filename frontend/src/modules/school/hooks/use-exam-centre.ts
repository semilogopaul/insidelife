'use client';

import {
  DISTRICTS,
  isVenueOpen,
  streetDistrict,
  toDateParts,
  venuesOfType,
  type DistrictId,
  type VenueDefinition,
} from '@insidelife/shared';
import { useSnapshot } from '@/common/game/snapshot';
import { useGameMinute } from '@/common/game/use-game-clock';
import { nearestVenue } from '../services/school-rules';
import { useCurrentPlace } from '@/common/hooks/use-current-place';

const CBT_CENTRES = venuesOfType('cbt-centre');

export interface ExamCentre {
  /** The CBT centre you're inside right now. */
  readonly here: VenueDefinition | null;
  /** It's open right now (registration 7am–6pm). */
  readonly open: boolean;
  /** Closest CBT centre to where you are. */
  readonly nearest: VenueDefinition | null;
  readonly all: readonly VenueDefinition[];
}

/** JAMB/GCE happen in person: are you in a CBT centre, and which one is closest? */
export function useExamCentre(): ExamCentre {
  const place = useCurrentPlace();
  const { data: snapshot } = useSnapshot();
  const minute = useGameMinute(10_000);
  const here = place.venue?.type === 'cbt-centre' ? place.venue : null;
  const from: DistrictId | null =
    place.venue?.districtId ??
    (place.locationId ? streetDistrict(place.locationId) : null) ??
    snapshot?.character.homeDistrictId ??
    null;
  const hour = toDateParts(minute).hour;
  return {
    here,
    open: here ? isVenueOpen(here, hour) : false,
    nearest: nearestVenue(CBT_CENTRES, from && from in DISTRICTS ? from : null),
    all: CBT_CENTRES,
  };
}
