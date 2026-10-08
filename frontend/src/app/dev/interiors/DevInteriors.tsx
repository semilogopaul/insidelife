'use client';

import { Canvas } from '@react-three/fiber';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WebGLRenderer } from 'three';
import type { AvatarClip } from '@/common/three/avatar';
// eslint-disable-next-line no-restricted-imports -- dev-only QA route renders the interiors sub-feature directly (the world feature mounts it in-game).
import {
  INTERIOR_TEMPLATE_IDS,
  InteriorScene,
  MoneyRain,
  type InteriorPlayer,
  type InteriorTemplateId,
  type MoneyRainHandle,
} from '@/modules/world/interiors';

const PLAYER: InteriorPlayer = {
  appearance: {
    bodyType: 'average',
    height: 1,
    skinTone: 3,
    hairStyle: 'twists',
    hairColor: 0,
    facialHair: 'stubble',
    eyeStyle: 'almond',
  },
  outfit: {
    top: 'ankara-shirt',
    bottom: 'okrika-jeans',
    shoes: 'balogun-sneakers',
    accessory: 'digital-watch',
  },
  gender: 'male',
  animation: 'idle',
  mood: 75,
};

interface RendererInfo {
  readonly calls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
}

export function DevInteriors() {
  const params = useSearchParams();
  const type = (params.get('type') ?? 'home-family') as InteriorTemplateId;
  const hourParam = params.get('hour');
  const hour = hourParam === null ? 11 : Number(hourParam);
  const anim = params.get('anim') as AvatarClip | null;
  const nepa = params.get('nepa') === '1' ? true : params.get('nepa') === '0' ? false : undefined;
  const spray = params.get('spray') === '1';
  const top = params.get('cam') === 'top';
  const enterAfter = Number(params.get('enterAfter') ?? '0');
  const [entered, setEntered] = useState(enterAfter <= 0);

  useEffect(() => {
    if (enterAfter <= 0) return;
    // Entry-hitch measurement: mount the room after warm-up and mark the moment (read by the QA script).
    const id = window.setTimeout(() => {
      (window as unknown as { __il_enteredAt: number }).__il_enteredAt = performance.now();
      setEntered(true);
    }, enterAfter);
    return () => window.clearTimeout(id);
  }, [enterAfter]);
  const player = useMemo<InteriorPlayer>(() => ({ ...PLAYER, animation: anim ?? 'idle' }), [anim]);
  const [gl, setGl] = useState<WebGLRenderer | null>(null);
  const rain = useRef<MoneyRainHandle>(null);

  useEffect(() => {
    if (!spray) return;
    // A big first throw (what the play layer does on a realtime `party:spray`), then the steady rain.
    const id = window.setTimeout(() => rain.current?.burst(70), 1200);
    return () => window.clearTimeout(id);
  }, [spray]);
  const [info, setInfo] = useState<RendererInfo | null>(null);

  useEffect(() => {
    if (!gl) return;
    const id = window.setInterval(() => {
      setInfo({
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [gl]);

  return (
    <main className="fixed inset-0 bg-ink">
      <Canvas
        dpr={[1, 1.75]}
        camera={top ? { fov: 38, position: [0, 13, 0.01] } : { fov: 38, position: [8, 8, 8] }}
        onCreated={({ gl: renderer, scene }) => {
          setGl(renderer);
          (window as unknown as { __il_scene: unknown }).__il_scene = scene;
        }}
      >
        {entered && (
          <InteriorScene
            locationId={type}
            templateId={type === ('kit-test' as InteriorTemplateId) ? type : undefined}
            player={player}
            hour={hour}
            nepa={nepa}
            camera={top ? 'none' : 'dollhouse'}
          >
            {spray && <MoneyRain ref={rain} origin={[0.2, 2.1, 0.8]} active rate={14} spread={1.2} />}
          </InteriorScene>
        )}
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-3 rounded-card bg-ink/80 px-3 py-2 font-mono text-xs text-on-ink">
        <div>
          {type} · {hour}:00 {nepa ? '· NEPA off' : ''}
        </div>
        {info && (
          <div>
            calls {info.calls} · tris {info.triangles} · geo {info.geometries} · tex {info.textures}
          </div>
        )}
        <div className="opacity-60">
          {INTERIOR_TEMPLATE_IDS.length} templates · ?type= &amp;hour= &amp;anim= &amp;nepa=1 &amp;spray=1
        </div>
      </div>
    </main>
  );
}
