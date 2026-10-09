'use client';

import { useFrame } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PerspectiveCamera, type Object3D } from 'three';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { Avatar, type AvatarHandle } from '@/common/three/avatar';
import { applyKey, isGameKey, isTypingTarget, resetControls } from '../../play/input/controls';
import type { InteriorPlayer } from '../components/InteriorPeople';
import {
  isFreeAnimation,
  nextPortalTowards,
  portalGeometry,
  portalLabel,
  roomForActivity,
} from '../layouts/geometry';
import type { HomeLayout, LayoutRoom } from '../layouts/types';
import { pickPlayerSpot } from '../templates/spots';
import type { At, InteriorTemplate } from '../templates/types';
import { useHomeView } from './home-view-store';
import { HomeWalkRuntime, buildRoomPhysics } from './home-walk-runtime';
import { PortalMarkers } from './PortalMarkers';
import { PrebakeRooms } from './PrebakeRooms';
import type { HomeRoom } from './use-home-room';

export interface HomeWalkProps {
  readonly layout: HomeLayout;
  readonly room: LayoutRoom;
  /** The room as rendered (furnished with the owner's things). */
  readonly template: InteriorTemplate;
  readonly player: InteriorPlayer;
  /** Where NPCs and other people present are (obstacles). */
  readonly people: readonly At[];
}

const NUDGE_EVERY_MS = 20_000;

/**
 * The player on foot inside a home: owns the walk runtime (physics, activities, doors, camera), the player's avatar
 * and the door markers, and the keyboard while inside. The DOM half (stick, camera toggle, rooms) is
 * `InteriorOverlay`.
 */
export function HomeWalk({ layout, room, template, player, people }: HomeWalkProps) {
  const [runtime] = useState(() => new HomeWalkRuntime());
  const camera = useHomeView((state) => state.camera);
  const arrivalSeq = useHomeView((state) => state.arrivalSeq);
  const physics = useMemo(() => buildRoomPhysics(template, people), [template, people]);
  const portals = useMemo(() => room.portals.map((spec) => portalGeometry(template, spec)), [room, template]);

  useLayoutEffect(() => {
    runtime.loadRoom(
      { roomId: room.id, template, physics, portals },
      useHomeView.getState().arrival,
      arrivalSeq,
    );
  }, [runtime, room.id, template, physics, portals, arrivalSeq]);

  // What the server says we're doing, and where: a spot in this room, or a door towards the room it happens in.
  const animation = player.animation;
  const free = isFreeAnimation(animation);
  const target = free ? null : roomForActivity(layout, animation, room.id);
  const spot = target === room.id ? pickPlayerSpot(template.player, animation) : null;
  const via = useMemo(() => {
    if (!target || target === room.id) return null;
    const spec = nextPortalTowards(layout, room.id, target);
    return spec ? (portals.find((portal) => portal.id === spec.id) ?? null) : null;
  }, [layout, room.id, target, portals]);

  useLayoutEffect(() => {
    runtime.setActivity(free ? null : { animation, spot, via });
  }, [runtime, free, animation, spot, via, arrivalSeq]);

  useEffect(() => {
    // No way there on foot (shouldn't happen in authored layouts): fade straight to the activity.
    if (target && target !== room.id && !via) useHomeView.getState().go(target, { kind: 'spot' });
  }, [target, room.id, via]);

  useEffect(() => {
    useHomeView.getState().setBusy(!free);
  }, [free]);

  // `portals` is `room.portals` resolved, index for index.
  const tags = useMemo(
    () =>
      room.portals.flatMap((spec, index) =>
        spec.to
          ? [{ id: spec.id, kind: portals[index]?.kind ?? 'door', label: portalLabel(layout, room, spec) }]
          : [],
      ),
    [layout, room, portals],
  );
  useEffect(() => {
    useHomeView.getState().setPortals(tags);
  }, [tags]);
  useEffect(
    () => () => {
      useHomeView.getState().setPortals([]);
      useHomeView.getState().setBusy(false);
    },
    [],
  );

  useEffect(() => {
    runtime.setCameraMode(camera);
  }, [runtime, camera]);

  useEffect(() => {
    runtime.setEvents({
      onPortal: (portal) =>
        portal.to
          ? useHomeView.getState().go(portal.to.room, { kind: 'portal', portal: portal.to.portal })
          : false,
      onStep: () => gameEvents.emit('sfx', { id: 'footstep', volume: 0.25 }),
    });
  }, [runtime]);

  // Keyboard: WASD/arrows walk (camera-relative), Shift jogs, C switches the camera.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (
        (event.code === 'Space' || event.code === 'Enter') &&
        event.target instanceof HTMLElement &&
        event.target.closest('button, a, [role="button"]')
      )
        return;
      const blocked = isTypingTarget(event.target) || useUi.getState().phoneOpen;
      if (event.code === 'KeyC') {
        if (event.type === 'keydown' && !event.repeat && !blocked) useHomeView.getState().toggleCamera();
        return;
      }
      applyKey(event.code, event.type === 'keydown', event.repeat, blocked);
      if (!blocked && isGameKey(event.code)) event.preventDefault();
    };
    const onBlur = (): void => resetControls();
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    const offPhone = useUi.subscribe((state, previous) => {
      if (state.phoneOpen && !previous.phoneOpen) resetControls();
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      offPhone();
      resetControls();
    };
  }, []);

  // Tried to walk off mid-activity: say why nothing happens (now and then).
  useEffect(() => {
    let last = 0;
    const id = window.setInterval(() => {
      if (!runtime.takeNudge() || Date.now() - last < NUDGE_EVERY_MS) return;
      last = Date.now();
      toast({
        title: 'You’re busy right now',
        body: 'You can walk about when it ends — or change it in “Things to do here”.',
        tone: 'neutral',
      });
    }, 300);
    return () => window.clearInterval(id);
  }, [runtime]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    // Dev/QA hook (screenshots, scripted walks): `window.__il_home.placeWalker(x, z, heading)`.
    (window as unknown as { __il_home?: HomeWalkRuntime }).__il_home = runtime;
    return () => {
      delete (window as unknown as { __il_home?: HomeWalkRuntime }).__il_home;
    };
  }, [runtime]);

  // Other people's avatars (InteriorPeople's group): hidden while they block the walk camera's view.
  const people3d = useRef<Object3D | null>(null);
  useEffect(() => () => runtime.showEveryone(people3d.current), [runtime]);
  useFrame((state, delta) => {
    if (!people3d.current?.parent) people3d.current = state.scene.getObjectByName('people') ?? null;
    if (state.camera instanceof PerspectiveCamera)
      runtime.frame(
        state.camera,
        Math.min(delta, 0.05),
        performance.now(),
        state.size.width,
        state.size.height,
        people3d.current,
      );
  }, -1);

  const register = useCallback((handle: AvatarHandle | null) => runtime.registerAvatar(handle), [runtime]);
  return (
    <>
      <Avatar
        ref={register}
        appearance={player.appearance}
        outfit={player.outfit}
        gender={player.gender}
        mood={player.mood}
        animation="idle"
        props={spot?.props ?? true}
        seed={11}
      />
      <PortalMarkers portals={portals} />
    </>
  );
}

/** Where someone sits or stands (x, z). */
const footOf = (spot: { readonly at: readonly number[] }): At => [
  spot.at[0] as number,
  spot.at[spot.at.length - 1] as number,
];

/**
 * Walking in a home, as mounted by the interior scene: the walk itself (people present are obstacles: the room's
 * NPCs and the guest spots in use) and the other rooms' furniture baked ahead.
 */
export function HomeWalkLayer({
  home,
  template,
  player,
  guests,
}: {
  readonly home: HomeRoom;
  readonly template: InteriorTemplate;
  readonly player: InteriorPlayer;
  readonly guests: number;
}) {
  const people = useMemo<readonly At[]>(
    () => [...template.npcs.map(footOf), ...template.guests.slice(0, guests).map(footOf)],
    [template, guests],
  );
  const rooms = useMemo(() => home.layout.rooms.map((room) => room.template), [home.layout]);
  return (
    <>
      <HomeWalk layout={home.layout} room={home.room} template={template} player={player} people={people} />
      {rooms.length > 1 && (
        <Suspense fallback={null}>
          <PrebakeRooms templates={rooms} />
        </Suspense>
      )}
    </>
  );
}
