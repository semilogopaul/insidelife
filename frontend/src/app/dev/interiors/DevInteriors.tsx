'use client';

import { Canvas } from '@react-three/fiber';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WebGLRenderer } from 'three';
import { findAction, isInterruptibleAction, type ActionDefinition } from '@insidelife/shared';
import { gameEvents } from '@/common/game/game-events';
import { toast } from '@/common/components';
import { actionsAt, servicesAt, type PlaceKind } from '@/common/places';
import type { AvatarClip } from '@/common/three/avatar';
// eslint-disable-next-line no-restricted-imports -- dev-only QA route renders the interiors sub-feature directly (the world feature mounts it in-game).
import {
  INTERIOR_TEMPLATE_IDS,
  InteriorOverlay,
  InteriorScene,
  MoneyRain,
  useHomeView,
  venueTypeFor,
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

/** Activities to try in a home (what the server would start); `idle` = free to walk. */
const ACTIVITIES: readonly AvatarClip[] = ['idle', 'sleep', 'cook', 'sit', 'eat', 'type', 'shower', 'phone'];

/** What can be done in a template (homes: your own home's actions; venues: their venue type's). */
function placeKindOf(type: string): PlaceKind {
  if (type.startsWith('home-')) return { kind: 'home' };
  return { kind: 'venue', venueType: venueTypeFor(type) };
}

interface RendererInfo {
  readonly calls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
}

export function DevInteriors() {
  const params = useSearchParams();
  const type = (params.get('type') ?? 'home-family') as InteriorTemplateId;
  const hourParam = params.get('hour');
  const hour = hourParam === null ? 11 : Number(hourParam);
  const [anim, setAnim] = useState<AvatarClip | null>(() => params.get('anim') as AvatarClip | null);
  // Homes are walkable: `view=overview|walk` picks the camera, `room=kitchen` starts in another room of the layout.
  const view = params.get('view');
  const startRoom = params.get('room');
  const house = useHomeView((state) => state.house);
  const roomId = useHomeView((state) => state.roomId);
  const homeCamera = useHomeView((state) => state.camera);
  const nepa = params.get('nepa') === '1' ? true : params.get('nepa') === '0' ? false : undefined;
  const spray = params.get('spray') === '1';
  const top = params.get('cam') === 'top';
  const enterAfter = Number(params.get('enterAfter') ?? '0');
  // `items=tv-55,sofa-leather` furnishes the room with those belongings (your rented/owned home).
  const itemsParam = params.get('items');
  const homeItems = useMemo(() => (itemsParam === null ? undefined : itemsParam.split(',').filter(Boolean)), [itemsParam]);
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
  // Hotspot actions run locally here (no session): the avatar walks to the spot and plays it until you stop it.
  // `actions=treatment,lounge` previews any catalog actions here instead of the place's own (even engine-managed ones).
  const actionsParam = params.get('actions');
  const actions = useMemo(
    () => (actionsParam ? actionsParam.split(',').flatMap((id) => findAction(id) ?? []) : actionsAt(placeKindOf(type))),
    [type, actionsParam],
  );
  const services = useMemo(() => (actionsParam ? [] : servicesAt(placeKindOf(type))), [type, actionsParam]);
  const [running, setRunning] = useState<ActionDefinition | null>(null);
  const offer = useHomeView((state) => state.offer);
  const player = useMemo<InteriorPlayer>(() => ({ ...PLAYER, animation: running?.animation ?? anim ?? 'idle', actionId: running?.id ?? null }), [anim, running]);
  useEffect(() => {
    // E / 1–4: what the context button offers (the game's HUD does this through the play bridge).
    const onKey = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      const option = useHomeView.getState().selected ? -1 : ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(event.code);
      if (event.code !== 'KeyE' && option < 0) return;
      const current = useHomeView.getState().offer;
      const target = option >= 0 ? current?.more?.[option] : current;
      if (target) gameEvents.emit('interact', { interactableId: target.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (view === 'overview' || view === 'walk') useHomeView.getState().setCamera(view);
  }, [view]);
  useEffect(() => {
    if (house && startRoom) useHomeView.getState().travel(startRoom);
  }, [house, startRoom]);
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
        programs: gl.info.programs?.length ?? 0,
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [gl]);

  return (
    <main className="fixed inset-0 bg-ink">
      <Canvas
        dpr={[1, 1.75]}
        camera={top ? { fov: 38, position: [0, 13, 0.01] } : { fov: 38, position: [8, 8, 8] }}
        onCreated={({ gl: renderer, scene, camera }) => {
          setGl(renderer);
          // QA hooks: the scene and camera (scripts project things to tap them).
          (window as unknown as { __il_scene: unknown; __il_camera: unknown }).__il_scene = scene;
          (window as unknown as { __il_camera: unknown }).__il_camera = camera;
        }}
      >
        {entered && (
          <InteriorScene
            locationId={type}
            templateId={type === ('kit-test' as InteriorTemplateId) ? type : undefined}
            player={player}
            hour={hour}
            nepa={nepa}
            homeItems={homeItems}
            actions={actions}
            services={services}
            busy={running !== null && !isInterruptibleAction(running.id)}
            camera={top ? 'none' : 'dollhouse'}
          >
            {spray && <MoneyRain ref={rain} origin={[0.2, 2.1, 0.8]} active rate={14} spread={1.2} />}
          </InteriorScene>
        )}
      </Canvas>
      <InteriorOverlay
        onStartAction={setRunning}
        onOpenService={(service) => toast({ title: service.label, body: `${service.blurb} (${'panel' in service.opens ? `opens the ${service.opens.panel} panel` : `opens the ${service.opens.app} app`} in the game)`, tone: 'neutral' })}
      />
      <div className="pointer-events-none absolute bottom-4 right-4 flex flex-col items-end gap-1.5" data-testid="dev-context">
        {running && (
          <button type="button" onClick={() => setRunning(null)} className="pointer-events-auto h-10 rounded-card bg-okada px-3 text-sm font-bold text-white">
            {running.emoji} {running.verb} · Stop
          </button>
        )}
        {offer?.more?.map((option, index) => (
          <button key={option.id} type="button" onClick={() => gameEvents.emit('interact', { interactableId: option.id })} className="pointer-events-auto h-10 rounded-card bg-ink/80 px-3 text-sm font-bold text-on-ink">
            {option.emoji} {option.label}
            {option.disabled ? ` — ${option.disabled}` : ''} <kbd className="ml-1 rounded bg-white/15 px-1.5 py-0.5 text-xs">{index + 1}</kbd>
          </button>
        ))}
        {offer && (
          <button type="button" data-testid="dev-context-button" onClick={() => gameEvents.emit('interact', { interactableId: offer.id })} className="pointer-events-auto h-12 rounded-card bg-paper px-4 font-bold text-ink shadow-[var(--shadow-lift)]">
            {offer.emoji} {offer.label} <kbd className="ml-1 rounded bg-paper-3 px-1.5 py-0.5 text-xs">E</kbd>
          </button>
        )}
      </div>
      <div className="pointer-events-none absolute left-3 top-3 rounded-card bg-ink/80 px-3 py-2 font-mono text-xs text-on-ink">
        <div>
          {type} · {hour}:00 {nepa ? '· NEPA off' : ''}
        </div>
        {info && (
          <div>
            calls {info.calls} · tris {info.triangles} · geo {info.geometries} · tex {info.textures} · prg {info.programs}
          </div>
        )}
        <div className="opacity-60">
          {INTERIOR_TEMPLATE_IDS.length} templates · ?type= &amp;hour= &amp;anim= &amp;nepa=1 &amp;spray=1 &amp;room= &amp;view=overview &amp;actions=</div>
        <div className="opacity-60">tap a marker to walk there · its action shows bottom-right (E) and plays here
        </div>
        {house && (
          <div>
            room {roomId} · {homeCamera} camera · {actions.length} actions{running ? ` · ${running.id}` : ''}
          </div>
        )}
        {house && (
          <div className="pointer-events-auto mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Start an activity">
            {ACTIVITIES.map((clip) => (
              <button
                key={clip}
                type="button"
                data-anim={clip}
                onClick={() => {
                  setRunning(null);
                  setAnim(clip);
                }}
                className={(anim ?? 'idle') === clip ? 'rounded-chip bg-danfo px-1.5 py-0.5 text-ink' : 'rounded-chip bg-white/10 px-1.5 py-0.5'}
              >
                {clip}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
