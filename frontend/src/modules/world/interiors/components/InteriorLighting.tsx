'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, type DirectionalLight, type HemisphereLight, type MeshStandardMaterial, type PointLight, type Scene } from 'three';
import { toDateParts } from '@insidelife/shared';
import { gameClock } from '@/common/game/game-clock';
import type { LightingMood, LightingSpec, RoomSpec } from '../templates/types';

interface MoodProfile {
  readonly sky: string;
  readonly ground: string;
  readonly ambientDay: number;
  readonly ambientNight: number;
  readonly sun: number;
  readonly practical: string;
  readonly practicalDay: number;
  readonly practicalNight: number;
  readonly background: string;
}

const MOODS: Readonly<Record<LightingMood, MoodProfile>> = {
  home: { sky: '#fff1dc', ground: '#6b4a32', ambientDay: 1.35, ambientNight: 0.55, sun: 2.4, practical: '#ffc983', practicalDay: 0.6, practicalNight: 5.5, background: '#1a2b36' },
  office: { sky: '#f4f7ff', ground: '#5a5f66', ambientDay: 1.5, ambientNight: 1.0, sun: 2.0, practical: '#eef4ff', practicalDay: 2.5, practicalNight: 4.5, background: '#16232c' },
  clinic: { sky: '#eef7ff', ground: '#5d6b70', ambientDay: 1.55, ambientNight: 1.1, sun: 1.8, practical: '#e8f3ff', practicalDay: 2.5, practicalNight: 4.5, background: '#14242b' },
  club: { sky: '#5a3d8f', ground: '#1a1030', ambientDay: 0.75, ambientNight: 0.75, sun: 0, practical: '#ff3fb4', practicalDay: 6, practicalNight: 6, background: '#07040d' },
  worship: { sky: '#fff6e5', ground: '#6b5a45', ambientDay: 1.5, ambientNight: 1.0, sun: 2.2, practical: '#ffe2a8', practicalDay: 1.5, practicalNight: 5, background: '#1a2630' },
  outdoor: { sky: '#cfe8ff', ground: '#7a6a4a', ambientDay: 1.6, ambientNight: 0.35, sun: 3.0, practical: '#ffc06b', practicalDay: 0, practicalNight: 4, background: '#8fc3e8' },
  hall: { sky: '#fff2de', ground: '#6b4a32', ambientDay: 1.45, ambientNight: 1.05, sun: 2.0, practical: '#ffd79a', practicalDay: 2, practicalNight: 5.5, background: '#1b2733' },
  shop: { sky: '#f8fbff', ground: '#5d6066', ambientDay: 1.6, ambientNight: 1.2, sun: 1.8, practical: '#fff5e6', practicalDay: 3, practicalNight: 4.5, background: '#16242d' },
  bar: { sky: '#ffd6a8', ground: '#4a3020', ambientDay: 1.15, ambientNight: 0.85, sun: 1.4, practical: '#ff9f4a', practicalDay: 4, practicalNight: 6, background: '#120c0a' },
};

/** 0 at night, 1 at noon, smooth through dawn (6:00) and dusk (18:00). */
export function daylightAt(hour: number): number {
  return Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
}

/** Current game hour (fractional), or the override. Defaults to late morning before the clock syncs. */
export function currentHour(override?: number): number {
  if (override !== undefined) return override;
  if (!gameClock.ready) return 10.5;
  const parts = toDateParts(gameClock.now());
  return parts.hour + parts.minute / 60;
}

export interface InteriorLightingProps {
  readonly spec: LightingSpec;
  readonly room: RoomSpec;
  readonly glass: MeshStandardMaterial | null;
  /** Forced time of day (dev / screenshots). */
  readonly hour?: number;
  /** NEPA took light: practicals off, only the lantern. */
  readonly nepa: boolean;
  /** Lantern position when NEPA is off. */
  readonly lantern?: readonly [number, number, number];
}

/** Imperative helpers (module-level: three objects are mutated outside React's data flow). */
interface SceneLook {
  readonly background: Scene['background'];
  readonly fog: Scene['fog'];
}

/** Interiors bring their own backdrop and no city fog; the previous look is restored on exit. */
function swapBackground(scene: Scene, background: Color): SceneLook {
  const previous = { background: scene.background, fog: scene.fog };
  scene.background = background;
  scene.fog = null;
  return previous;
}

function restoreBackground(scene: Scene, previous: SceneLook): void {
  scene.background = previous.background;
  scene.fog = previous.fog;
}

function tintGlass(glass: MeshStandardMaterial, color: Color, intensity: number): void {
  glass.emissive.copy(color);
  glass.emissiveIntensity = intensity;
}

const SKY_DAY = new Color('#cfe7ff');
const SKY_DUSK = new Color('#ffb46b');
const SKY_NIGHT = new Color('#0f1d33');
const SUN_WARM = new Color('#ffd7a3');
const SUN_NOON = new Color('#fff6e8');

/**
 * Warm interior lighting tied to the game clock: daylight pours in through the windows by day; bulbs and lamps
 * take over at night (or a rechargeable lantern when NEPA strikes). No shadow maps — furniture and people carry
 * soft contact shadows — so interiors stay cheap.
 */
export function InteriorLighting({ spec, room, glass, hour, nepa, lantern }: InteriorLightingProps) {
  const mood = MOODS[spec.mood];
  const hemi = useRef<HemisphereLight>(null);
  const sun = useRef<DirectionalLight>(null);
  const practicals = useRef<Array<PointLight | null>>([]);
  const lanternRef = useRef<PointLight>(null);
  const scene = useThree((state) => state.scene);
  const background = useRef<Color | null>(null);
  const tmp = useRef(new Color());
  const practicalColor = spec.practicalColor ?? mood.practical;
  const points = spec.practicals ?? [[0, room.height - 0.3, 0]];
  const sunPosition = useMemo<[number, number, number]>(() => {
    const window = room.windows?.[0];
    if (window?.wall === 'left') return [-room.width * 1.5, room.height * 2.2, window.at + 1];
    return [room.width * 0.3, room.height * 2.4, -room.depth * 1.6];
  }, [room]);

  useEffect(() => {
    const color = new Color(mood.background);
    background.current = color;
    const previous = swapBackground(scene, color);
    return () => restoreBackground(scene, previous);
  }, [scene, mood.background]);

  useFrame(() => {
    const h = currentHour(hour);
    const day = daylightAt(h);
    const dusk = Math.max(0, 1 - Math.abs(h - 18.3) / 1.6) + Math.max(0, 1 - Math.abs(h - 6.4) / 1.4);
    const night = 1 - Math.min(1, day * 3);
    if (hemi.current) hemi.current.intensity = (mood.ambientNight + (mood.ambientDay - mood.ambientNight) * day) * (nepa ? 0.45 : 1);
    if (sun.current) {
      sun.current.intensity = mood.sun * day;
      sun.current.color.copy(SUN_WARM).lerp(SUN_NOON, Math.min(1, day * 1.6));
    }
    const lit = nepa ? 0 : mood.practicalDay + (mood.practicalNight - mood.practicalDay) * night;
    for (const light of practicals.current) if (light) light.intensity = lit;
    if (lanternRef.current) lanternRef.current.intensity = nepa ? 3.2 : 0;
    if (glass) tintGlass(glass, tmp.current.copy(SKY_NIGHT).lerp(SKY_DAY, day).lerp(SKY_DUSK, Math.min(0.6, dusk * 0.6)), 0.35 + day * 0.9);
    if (room.outdoor) background.current?.copy(SKY_NIGHT).lerp(SKY_DAY, day).lerp(SKY_DUSK, Math.min(0.5, dusk * 0.5));
  });

  return (
    <group name="interior-lighting">
      <hemisphereLight ref={hemi} args={[mood.sky, mood.ground, mood.ambientDay]} />
      <directionalLight ref={sun} position={sunPosition} intensity={mood.sun} />
      <directionalLight position={[room.width, room.height * 2, room.depth * 1.5]} intensity={0.55} color="#cfe3ff" />
      {points.map((point, index) => (
        <pointLight
          key={`${point.join(',')}`}
          ref={(light) => {
            practicals.current[index] = light;
          }}
          position={[point[0], point[1], point[2]]}
          color={practicalColor}
          intensity={mood.practicalNight}
          distance={Math.max(room.width, room.depth) * 0.9}
          decay={1.6}
        />
      ))}
      {lantern && <pointLight ref={lanternRef} position={[lantern[0], lantern[1] + 0.35, lantern[2]]} color="#ffd9a0" intensity={0} distance={5} decay={1.8} />}
    </group>
  );
}
