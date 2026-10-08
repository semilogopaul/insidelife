'use client';

import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { QualityProfile } from '../lib/quality';
import { batchTriangles } from '../render/batch-registry';

/** Renderer counters for QA (development only): `window.__IL_DIAGNOSTICS__`. */
export interface WorldDiagnostics {
  readonly calls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
  readonly fps: number;
  readonly dpr: number;
  readonly quality: QualityProfile['tier'];
  /** Triangles per city batch (main pass, before shadows). */
  readonly batches: Record<string, number>;
}

type DiagnosticsWindow = Window & { __IL_DIAGNOSTICS__?: WorldDiagnostics };

export function Diagnostics({ quality }: { readonly quality: QualityProfile }) {
  const frames = useRef(0);
  const elapsed = useRef(0);
  useFrame(({ gl }, delta) => {
    frames.current++;
    elapsed.current += delta;
    if (elapsed.current < 0.5) return;
    (window as DiagnosticsWindow).__IL_DIAGNOSTICS__ = {
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
      fps: Math.round(frames.current / elapsed.current),
      dpr: gl.getPixelRatio(),
      quality: quality.tier,
      batches: batchTriangles(),
    };
    frames.current = 0;
    elapsed.current = 0;
  });
  return null;
}
