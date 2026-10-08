'use client';

import { CITY_MAP } from '@insidelife/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { currentBillboard } from '../../city/billboards/billboard-content';
import { useLiveBillboards } from '../../city/billboards/use-billboards';
import { promotionsApi } from '../flow/movement.api';
import type { PlayRuntime } from '../runtime/play-runtime';
import { ImpressionTracker } from './impressions';

const RANGE = 60;
const SAMPLE_SECONDS = 0.25;

/**
 * Counts billboard impressions: a paid creative on screen, facing the camera, within 60 m for a second. Batches are
 * flushed at most every 20 s to `POST /promotions/impressions` (online sessions only).
 */
export function BillboardTracker({ runtime, online }: { readonly runtime: PlayRuntime; readonly online: boolean }) {
  const { data: live } = useLiveBillboards();
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);
  const tracker = useMemo(() => new ImpressionTracker(), []);
  const timer = useRef(0);

  useFrame(({ camera }, delta) => {
    timer.current += delta;
    if (timer.current < SAMPLE_SECONDS) return;
    const dtMs = timer.current * 1000;
    timer.current = 0;
    const now = Date.now();
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    for (const board of CITY_MAP.billboards) {
      const bx = board.position.x;
      const by = board.elevation + board.height / 2;
      const bz = board.position.z;
      const tx = cx - bx;
      const tz = cz - bz;
      const near = Math.hypot(tx, cy - by, tz) <= RANGE;
      const facing = tx * Math.cos(board.facing) + tz * Math.sin(board.facing) > 0;
      const inView = near && facing && runtime.visible(bx, bz, by, board.width / 2);
      const content = near ? currentBillboard(board.slotId, liveRef.current, now) : null;
      tracker.observe(board.slotId, content?.kind === 'creative' ? content.campaignId : null, inView, dtMs, now);
    }
  });

  useEffect(() => {
    if (!online) return;
    const id = window.setInterval(() => {
      const batch = tracker.takeBatch(Date.now());
      if (!batch) return;
      promotionsApi.impressions({ campaignIds: batch }).catch(() => tracker.restore(batch));
    }, 1000);
    return () => window.clearInterval(id);
  }, [online, tracker]);

  return null;
}
