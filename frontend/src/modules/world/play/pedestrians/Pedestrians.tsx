'use client';

import { useFrame } from '@react-three/fiber';
import { useCallback, useMemo, useRef } from 'react';
import { Avatar, npcLook, OUTFIT_THEMES, type AvatarClip, type AvatarHandle } from '@/common/three/avatar';
import type { BlobShadows } from '../effects/blob-shadows';
import { yawFromHeading } from '../physics/math';
import { groundHeightAt } from '../physics/surface';
import { PLAYER_SCALE, gaitFor, type PlayRuntime } from '../runtime/play-runtime';
import { PedestrianSim } from './pedestrian-sim';

const PED_SCALE = PLAYER_SCALE * 0.97;

const STREET_THEMES = OUTFIT_THEMES.filter((theme) => theme === 'casual' || theme === 'street' || theme === 'market' || theme === 'corporate' || theme === 'campus');

interface Slot {
  handle: AvatarHandle | null;
  clip: AvatarClip;
}

/** A handful of low-LOD Lagosians walking the pavements near the camera (one draw call each, shared blob shadows). */
export function Pedestrians({ runtime, count, seed, blobs, blobBase }: { readonly runtime: PlayRuntime; readonly count: number; readonly seed: string; readonly blobs: BlobShadows | null; readonly blobBase: number }) {
  const sim = useMemo(() => new PedestrianSim(count, seed), [count, seed]);
  const looks = useMemo(() => Array.from({ length: count }, (_, i) => npcLook(`${seed}:ped:${i}`, STREET_THEMES[i % STREET_THEMES.length] ?? 'casual')), [count, seed]);
  const slots = useRef<Slot[]>(Array.from({ length: count }, () => ({ handle: null, clip: 'idle' as AvatarClip })));
  const registers = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => (handle: AvatarHandle | null) => {
        const slot = slots.current[i];
        if (slot) {
          slot.handle = handle;
          slot.clip = 'idle';
        }
      }),
    [count],
  );
  const register = useCallback((i: number) => registers[i], [registers]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const player = runtime.controller;
    sim.update(dt, runtime.subjectX, runtime.subjectZ, player.walker.x, player.walker.z, runtime.isVisible);
    for (const ped of sim.peds) {
      const slot = slots.current[ped.index];
      const object = slot?.handle?.object;
      if (!slot || !object) continue;
      object.visible = ped.active;
      if (!ped.active) {
        blobs?.hide(blobBase + ped.index);
        continue;
      }
      const y = groundHeightAt(ped.x, ped.z);
      object.position.set(ped.x, y, ped.z);
      object.rotation.y = yawFromHeading(ped.heading);
      const gait = gaitFor(ped.speed, PED_SCALE);
      if (gait.clip !== slot.clip) {
        slot.clip = gait.clip;
        slot.handle?.play(gait.clip, { fade: 0.3 });
        slot.handle?.setTimeScale(gait.timeScale);
      }
      blobs?.set(blobBase + ped.index, ped.x, y, ped.z, 0.9);
    }
  }, -3);

  return (
    <>
      {looks.map((look, i) => (
        <Avatar
          key={i}
          ref={register(i)}
          appearance={look.appearance}
          outfit={look.outfit}
          clothing={look.clothing}
          gender={look.gender}
          lod="low"
          deferBuild
          shadow={false}
          props={false}
          scale={PED_SCALE}
          seed={1000 + i}
          animation="idle"
        />
      ))}
    </>
  );
}
