'use client';

import { Canvas } from '@react-three/fiber';
import { useCallback, useRef } from 'react';
import type { AircraftClass, AircraftLivery } from '../contract';
import { FlightOverlay } from './FlightOverlay';
import { FlightScene, defaultQuality, type FlightQuality } from './FlightScene';

export interface FlightSequenceProps {
  readonly cls: AircraftClass;
  readonly livery: AircraftLivery;
  /** How long the flight plays. */
  readonly durationMs: number;
  readonly from?: string;
  readonly to?: string;
  readonly quality?: FlightQuality;
  /** Called exactly once, when the flight ends or is skipped. */
  readonly onFinish: (reason: 'landed' | 'skipped') => void;
}

/**
 * A self-contained flight sequence: its own full-size canvas and the overlay. The game's play layer, which already owns
 * the one Canvas, renders `<FlightScene>` inside it and `<FlightOverlay>` on top instead; this wrapper is for previews
 * and for screens without a canvas. Phones get a lower pixel ratio and no antialiasing.
 */
export function FlightSequence({ cls, livery, durationMs, from, to, quality, onFinish }: FlightSequenceProps) {
  const finished = useRef(false);
  const finish = useCallback(
    (reason: 'landed' | 'skipped') => {
      if (finished.current) return;
      finished.current = true;
      onFinish(reason);
    },
    [onFinish],
  );
  const level = quality ?? defaultQuality();
  return (
    <div className="relative h-full w-full" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas dpr={level === 'low' ? [1, 1.25] : [1, 1.75]} gl={{ antialias: level === 'high', powerPreference: 'high-performance' }} camera={{ fov: 50, near: 0.5, far: 3200, position: [9, 3, -15] }}>
        <FlightScene cls={cls} livery={livery} durationMs={durationMs} quality={level} onDone={() => finish('landed')} />
      </Canvas>
      <FlightOverlay cls={cls} durationMs={durationMs} from={from} to={to} onSkip={() => finish('skipped')} />
    </div>
  );
}
