'use client';

import { useReducedMotion } from 'motion/react';
import { useMemo, useRef } from 'react';
import { NIGHT_OUT_VENUE_TYPES, findVenue } from '@insidelife/shared';
import { liveMoments, useMomentClock } from '@/common/night-out';
import { resolveTemplateId } from '../../interiors';
import { getTemplate } from '../../interiors/templates/registry';
import { roomAnchors } from './moments/anchors';
import { MomentEffect } from './moments/effects';
import { ConfettiField, FxContext, SparkField, type ConfettiHandle, type FxPools, type SparkHandle } from './moments/fx-fields';

/**
 * Inside a club or bar: paid moments (`venue:moment`, via the shared moments store) play in the room — sparkler
 * bottles, a bottle parade, the DJ's spotlight, confetti, an odogwu's name on the LED wall with CO2 and fireworks, a
 * birthday cake, a champagne shower, the VIP sign with the holder's name. Two pooled particle meshes (idle = no draw
 * call), no extra lights (the room's light rig stays fixed). Reduced motion: no particles or flashing; signs, names
 * and objects still show. Rendered as a child of the interior, next to `InteriorSpray`.
 */
export function InteriorMoments({ venueId }: { readonly venueId: string }) {
  const venue = findVenue(venueId);
  const nightlife = venue !== undefined && (NIGHT_OUT_VENUE_TYPES as readonly string[]).includes(venue.type);
  return nightlife ? <RoomMoments venueId={venueId} /> : null;
}

function RoomMoments({ venueId }: { readonly venueId: string }) {
  const { moments, now } = useMomentClock();
  const reduced = useReducedMotion() ?? false;
  const anchors = useMemo(() => roomAnchors(getTemplate(resolveTemplateId(venueId))), [venueId]);
  const sparks = useRef<SparkHandle>(null);
  const confetti = useRef<ConfettiHandle>(null);
  const pools = useMemo<FxPools>(() => ({ sparks, confetti }), []);
  const live = liveMoments(moments, now).filter((moment) => moment.venueId === venueId);

  return (
    <FxContext.Provider value={pools}>
      <group name="venue-moments">
        <SparkField ref={sparks} />
        <ConfettiField ref={confetti} />
        {live.map((moment) => (
          <MomentEffect key={moment.id} moment={moment} anchors={anchors} reduced={reduced} />
        ))}
      </group>
    </FxContext.Provider>
  );
}
