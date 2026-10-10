'use client';

import { AD_VIEW_RADIUS_METRES, BILLBOARD_SLOT_IDS, adFaceCentre, adGroundDistance, adSpotGeometry, isInFrontOfAd, type AdSpotGeometry } from '@insidelife/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { currentBillboard } from '../../city/billboards/billboard-content';
import { useLiveBillboards } from '../../city/billboards/use-billboards';
import type { PlayRuntime } from '../runtime/play-runtime';
import { adViewClock, flushWorldAdViews, worldAdViews } from './report-views';

const SAMPLE_SECONDS = 0.25;
const FLUSH_CHECK_MS = 1_000;

const PREMIUM: readonly AdSpotGeometry[] = BILLBOARD_SLOT_IDS.flatMap((slotId) => adSpotGeometry(slotId) ?? []);
const PREMIUM_IDS: ReadonlySet<string> = new Set(PREMIUM.map((spot) => spot.slotId));

/**
 * Counts views of paid creatives on the city's boards (rules in shared `catalog/ad-views.ts`): the *player* (walking,
 * driving or riding — not the camera) within `AD_VIEW_RADIUS_METRES` of the board, on its printed side, with the face
 * on screen, for `AD_VIEW_DWELL_MS` without a break. Each campaign counts once per game hour; views are reported in
 * batches (`flushWorldAdViews`, at most every 20 s) and only in online sessions.
 */
export function BillboardTracker({ runtime, online }: { readonly runtime: PlayRuntime; readonly online: boolean }) {
  const { data: live } = useLiveBillboards();
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);
  const timer = useRef(0);

  useFrame((_, delta) => {
    if (!online) return;
    timer.current += delta;
    if (timer.current < SAMPLE_SECONDS) return;
    const dtMs = timer.current * 1000;
    timer.current = 0;
    const player = { x: runtime.subjectX, z: runtime.subjectZ };
    const now = Date.now();
    const clock = adViewClock();
    const observe = (spot: AdSpotGeometry): void => {
      const near = adGroundDistance(spot, player) <= AD_VIEW_RADIUS_METRES;
      const content = near ? currentBillboard(spot.slotId, liveRef.current, now) : null;
      const campaignId = content?.kind === 'creative' ? content.campaignId : null;
      let inView = false;
      if (campaignId && isInFrontOfAd(spot, player)) {
        const centre = adFaceCentre(spot);
        inView = runtime.visible(centre.x, centre.z, centre.y, Math.max(spot.width, spot.height) / 2);
      }
      worldAdViews.observe(spot.slotId, campaignId, inView, dtMs, clock);
    };
    for (const spot of PREMIUM) observe(spot);
    // Street spots only matter while a paid creative runs on them.
    for (const slot of liveRef.current?.slots ?? []) {
      const spot = slot.creatives.length > 0 && !PREMIUM_IDS.has(slot.slotId) ? adSpotGeometry(slot.slotId) : null;
      if (spot) observe(spot);
    }
  });

  useEffect(() => {
    if (!online) return;
    const id = window.setInterval(() => flushWorldAdViews(), FLUSH_CHECK_MS);
    return () => {
      window.clearInterval(id);
      // Leaving the street (going inside, signing out): send what's queued while it still counts.
      flushWorldAdViews(true);
    };
  }, [online]);

  return null;
}
