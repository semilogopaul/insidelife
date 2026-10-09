'use client';

import { useGLTF } from '@react-three/drei';
import { useEffect } from 'react';
import { enqueueFrameJob } from '@/common/three/core/build-queue';
import { FURNITURE_URL, bakedKey, obtainBaked, retainBaked } from '../kit/furniture-kit';
import type { InteriorTemplate } from '../templates/types';

/**
 * Bakes the furniture of a home's other rooms ahead of time, one model per frame, and keeps it while you're in the
 * house, so walking through a door never waits on geometry. (The kit is one shared GLB, already loaded.)
 */
export function PrebakeRooms({ templates }: { readonly templates: readonly InteriorTemplate[] }) {
  const { scene } = useGLTF(FURNITURE_URL, false, true);
  useEffect(() => {
    const seen = new Set<string>();
    const cancels: Array<() => void> = [];
    const releases: Array<() => void> = [];
    for (const template of templates) {
      for (const piece of template.furniture) {
        const key = bakedKey(piece.model, piece.palette);
        if (seen.has(key)) continue;
        seen.add(key);
        const node = scene.getObjectByName(piece.model);
        if (!node) continue;
        cancels.push(
          enqueueFrameJob(() => {
            obtainBaked(piece.model, node, piece.palette);
            releases.push(retainBaked(piece.model, piece.palette));
          }),
        );
      }
    }
    return () => {
      for (const cancel of cancels) cancel();
      for (const release of releases) release();
    };
  }, [scene, templates]);
  return null;
}
