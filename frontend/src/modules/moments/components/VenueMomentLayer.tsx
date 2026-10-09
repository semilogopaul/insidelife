'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';
import { NIGHT_OUT_VENUE_TYPES, findVenue, isHomeLocation, isStreetLocation } from '@insidelife/shared';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { VenueMomentBanner, bannerMoments, useMomentClock, useVenueMomentsFeed } from '@/common/night-out';

/** The club or bar you're standing in (null anywhere else, and while travelling). */
function useNightlifeVenue(): string | null {
  const { data: snapshot } = useSnapshot();
  if (!snapshot || snapshot.travel) return null;
  const locationId = snapshot.character.locationId;
  if (isStreetLocation(locationId) || isHomeLocation(locationId)) return null;
  const venue = findVenue(locationId);
  return venue && (NIGHT_OUT_VENUE_TYPES as readonly string[]).includes(venue.type) ? venue.id : null;
}

/**
 * Club nights on screen: a bold banner when someone's DJ shoutout plays (one at a time — the server queues them),
 * and smaller lines for bottles sent and experiences. Feeds the shared moments store that the 3D room also reads.
 * Reduced motion: banners fade in place, no confetti. Tap a name to see who it is (block and report live there).
 */
export function VenueMomentLayer() {
  const venueId = useNightlifeVenue();
  useVenueMomentsFeed(venueId);
  const { moments, now } = useMomentClock();
  const reduceMotion = useReducedMotion() ?? false;
  const openPhone = useUi((state) => state.openPhone);
  const { headline, others } = venueId ? bannerMoments(moments, now) : { headline: null, others: [] };

  const headlineId = headline?.id ?? null;
  const headlineTier = headline?.tier ?? null;
  useEffect(() => {
    if (headlineId) gameEvents.emit('sfx', { id: headlineTier === 'shoutout-basic' ? 'ui-success' : 'celebration' });
  }, [headlineId, headlineTier]);
  const newest = others[0]?.id ?? null;
  useEffect(() => {
    if (newest) gameEvents.emit('sfx', { id: 'ui-success', volume: 0.6 });
  }, [newest]);

  const openProfile = (handle: string): void => openPhone('gist', `@${handle}`);
  const enter = reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.92 };
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[24%] z-30 flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {headline && (
          <motion.div
            key={headline.id}
            className="flex w-full justify-center"
            initial={enter}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 320, damping: 22 }}
          >
            <VenueMomentBanner moment={headline} variant="headline" reducedMotion={reduceMotion} onOpenProfile={openProfile} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {others.map((moment) => (
          <motion.div key={moment.id} className="flex max-w-md justify-center" initial={enter} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <VenueMomentBanner moment={moment} variant="chip" reducedMotion={reduceMotion} onOpenProfile={openProfile} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
