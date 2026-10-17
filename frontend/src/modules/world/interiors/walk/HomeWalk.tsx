'use client';

import { useFrame } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BoxGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  MeshBasicMaterial,
  PerspectiveCamera,
  type Object3D,
} from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { findAction, type ActionDefinition } from '@insidelife/shared';
import { toast } from '@/common/components';
import type { GoalHere } from '@/common/places';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { Avatar, type AvatarHandle } from '@/common/three/avatar';
import { SELF_ANCHOR, trackAvatar } from '../../speech/speech-anchors';
import { applyKey, isGameKey, isTypingTarget, resetControls } from '../../play/input/controls';
import type { InteriorPlayer } from '../components/InteriorPeople';
import { actionSpot, type ActionLike } from '../hotspots/action-spots';
import type { PlaceService } from '@/common/places';
import { MAX_MORE, PHONE_MAX_MORE, hotspotCard, hotspotInteractable, type ActionStatus, type Hotspot } from '../hotspots/hotspots';
import {
  isFreeAnimation,
  nextPortalTowards,
  portalGeometry,
  portalLabel,
  roomForActivity,
} from '../layouts/geometry';
import type { HomeLayout, LayoutRoom } from '../layouts/types';
import type { At, InteriorTemplate } from '../templates/types';
import { useHomeView } from './home-view-store';
import { HomeWalkRuntime, buildRoomPhysics } from './home-walk-runtime';
import { PortalMarkers } from './PortalMarkers';
import { PrebakeRooms } from './PrebakeRooms';
import { setActiveWalkRuntime } from './walk-pose';
import type { HomeRoom } from './use-home-room';

export interface HomeWalkProps {
  readonly layout: HomeLayout;
  readonly room: LayoutRoom;
  /** The room as rendered (furnished with the owner's things). */
  readonly template: InteriorTemplate;
  readonly player: InteriorPlayer;
  /** Where NPCs and other people present are (obstacles). */
  readonly people: readonly At[];
  /** This room's hotspots, and whether they're hidden (something you chose is running). */
  readonly hotspots: readonly Hotspot[];
  readonly busy: boolean;
  /** An action's price note ("₦18,000", "" when free) and why it can't be done now, if it can't. */
  readonly status: (entry: ActionDefinition | PlaceService) => ActionStatus;
  /** The life goal that brought you here and what advances it (its hotspot is highlighted). */
  readonly goal: GoalHere | null;
}

const NUDGE_EVERY_MS = 20_000;
/** How often what's on offer is published to the HUD (the frame loop works it out every frame). */
const OFFER_EVERY_MS = 200;

/** The running action (its own spot) when it matches what the avatar plays, else just the animation. */
function runningAction(
  actionId: string | null | undefined,
  animation: InteriorPlayer['animation'],
): ActionLike {
  const action = actionId ? findAction(actionId) : undefined;
  return action && action.animation === animation ? action : { animation };
}

/**
 * The player on foot inside a home or venue: owns the walk runtime (physics, activities, doors, hotspots, camera),
 * the player's avatar and the door markers, and the keyboard while inside. The DOM half (stick, camera toggle, rooms,
 * hotspot markers) is `InteriorOverlay`.
 */
export function HomeWalk({
  layout,
  room,
  template,
  player,
  people,
  hotspots,
  busy,
  status,
  goal,
}: HomeWalkProps) {
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
  const target = free ? null : roomForActivity(layout, animation, room.id, player.actionId);
  const action = useMemo(() => runningAction(player.actionId, animation), [player.actionId, animation]);
  const spot = useMemo(
    () => (target === room.id ? actionSpot(template, action) : null),
    [target, room.id, template, action],
  );
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

  // Hotspots: markers for the overlay, what's on offer for the HUD (published at a low rate), taps on markers.
  const hidden = busy || !free;
  useLayoutEffect(() => {
    runtime.setHotspots(hotspots, hidden);
  }, [runtime, hotspots, hidden]);
  useEffect(() => {
    useHomeView.getState().setHotspots(hotspots.map((hotspot) => hotspotCard(hotspot, status, goal)));
  }, [hotspots, status, goal]);
  // The card that's open and what the overview's pointer is over: the highlight box follows them.
  useEffect(
    () =>
      useHomeView.subscribe((state) => {
        runtime.setFocus(state.hover, state.selected);
      }),
    [runtime],
  );
  const offerSource = useRef({ hotspots, status });
  useEffect(() => {
    offerSource.current = { hotspots, status };
  });
  useEffect(() => {
    const publish = (): void => {
      const id = runtime.offered;
      const hotspot = id ? offerSource.current.hotspots.find((candidate) => candidate.id === id) : undefined;
      useHomeView
        .getState()
        .setOffer(
          hotspot ? hotspot.id : null,
          hotspot ? hotspotInteractable(hotspot, offerSource.current.status, window.matchMedia('(min-width: 768px)').matches ? MAX_MORE : PHONE_MAX_MORE) : null,
        );
    };
    // The thing under the mouse on the walk camera (the overview's pointer events set it themselves).
    let lastHover: string | null = null;
    const publishHover = (): void => {
      if (runtime.cameraMode !== 'walk' || runtime.hovered === lastHover) return;
      lastHover = runtime.hovered;
      useHomeView.getState().setHover(lastHover);
    };
    publish();
    const timer = window.setInterval(() => {
      publish();
      publishHover();
    }, OFFER_EVERY_MS);
    const offPick = useHomeView.subscribe((state, previous) => {
      if (state.picked && state.picked !== previous.picked && runtime.goToHotspot(state.picked.id)) publish();
    });
    return () => {
      window.clearInterval(timer);
      offPick();
      useHomeView.getState().setOffer(null, null);
      useHomeView.getState().setHotspots([]);
    };
  }, [runtime]);

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
      onPortal: (portal) => {
        if (portal.to) return useHomeView.getState().go(portal.to.room, { kind: 'portal', portal: portal.to.portal });
        // The front door: the same as "Step outside" (it shows its own message if you can't leave yet).
        gameEvents.emit('exit-building', {});
        return true;
      },
      onStep: () => gameEvents.emit('sfx', { id: 'footstep', volume: 0.25 }),
      onPick: (id) => {
        gameEvents.emit('sfx', { id: 'ui-click' });
        useHomeView.getState().select(id);
      },
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

  // Scene content that reacts to where you stand (the apron's boarding door) reads the walker through this.
  useEffect(() => {
    setActiveWalkRuntime(runtime);
    return () => setActiveWalkRuntime(null);
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

  const register = useCallback(
    (handle: AvatarHandle | null) => {
      runtime.registerAvatar(handle);
      if (!handle) return undefined;
      // Your speech bubble follows your head. (Returning a cleanup means React won't call this with null.)
      const untrack = trackAvatar(SELF_ANCHOR, handle);
      return () => {
        untrack();
        runtime.registerAvatar(null);
      };
    },
    [runtime],
  );
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
      <HotspotTargets runtime={runtime} hotspots={hotspots} overview={camera === 'overview'} />
    </>
  );
}

/** A tap less than this many pixels from where it started is a tap, not an orbit drag. */
const TAP_SLOP_PX = 8;

/**
 * The things you can use, in 3D: a glowing edges box round the one under the pointer or whose card is open (one line
 * draw, placed by the frame loop), and in the overview (where the dollhouse camera takes the pointer) invisible tap
 * boxes that open a thing's card. On the walk camera the frame loop picks things itself from taps and the mouse.
 */
function HotspotTargets({
  runtime,
  hotspots,
  overview,
}: {
  readonly runtime: HomeWalkRuntime;
  readonly hotspots: readonly Hotspot[];
  readonly overview: boolean;
}) {
  const resources = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    return {
      box,
      edges: new EdgesGeometry(box),
      line: new LineBasicMaterial({ color: '#f6b90b', transparent: true, opacity: 0.95, toneMapped: false }),
      hit: new MeshBasicMaterial(),
    };
  }, []);
  useEffect(
    () => () => {
      resources.box.dispose();
      resources.edges.dispose();
      resources.line.dispose();
      resources.hit.dispose();
    },
    [resources],
  );
  const highlight = useCallback((object: Object3D | null) => runtime.registerHighlight(object), [runtime]);
  useEffect(
    () => () => {
      document.body.style.cursor = '';
    },
    [],
  );
  const view = useHomeView.getState;
  return (
    <group name="hotspot-targets">
      <lineSegments
        ref={highlight}
        geometry={resources.edges}
        material={resources.line}
        visible={false}
        renderOrder={4}
      />
      {overview &&
        hotspots
          .flatMap((hotspot) => [hotspot.box, ...hotspot.aliases].map((b, index) => ({ hotspot, b, index })))
          .map(({ hotspot, b, index }) => {
            return (
              <mesh
                key={`${hotspot.id}#${index}`}
                visible={false}
                geometry={resources.box}
                material={resources.hit}
                position={[(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2]}
                scale={[b.maxX - b.minX + 0.3, b.maxY - b.minY + 0.2, b.maxZ - b.minZ + 0.3]}
                onClick={(event: ThreeEvent<MouseEvent>) => {
                  if (event.delta > TAP_SLOP_PX) return;
                  event.stopPropagation();
                  gameEvents.emit('sfx', { id: 'ui-click' });
                  view().select(hotspot.id);
                }}
                onPointerOver={(event: ThreeEvent<PointerEvent>) => {
                  event.stopPropagation();
                  view().setHover(hotspot.id);
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={() => {
                  if (view().hover === hotspot.id) view().setHover(null);
                  document.body.style.cursor = '';
                }}
              />
            );
          })}
    </group>
  );
}

/** Where someone sits or stands (x, z). */
const footOf = (spot: { readonly at: readonly number[] }): At => [
  spot.at[0] as number,
  spot.at[spot.at.length - 1] as number,
];

/**
 * Walking in a home or venue, as mounted by the interior scene: the walk itself (people present are obstacles: the
 * room's NPCs and the guest spots in use) and the other rooms' furniture baked ahead.
 */
export function HomeWalkLayer({
  home,
  template,
  player,
  guests,
  hotspots,
  busy,
  status,
  goal,
}: {
  readonly home: HomeRoom;
  readonly template: InteriorTemplate;
  readonly player: InteriorPlayer;
  readonly guests: number;
  readonly hotspots: readonly Hotspot[];
  readonly busy: boolean;
  readonly status: (entry: ActionDefinition | PlaceService) => ActionStatus;
  readonly goal: GoalHere | null;
}) {
  const people = useMemo<readonly At[]>(
    () => [...template.npcs.map(footOf), ...template.guests.slice(0, guests).map(footOf)],
    [template, guests],
  );
  const rooms = useMemo(() => home.layout.rooms.map((room) => room.template), [home.layout]);
  return (
    <>
      <HomeWalk
        layout={home.layout}
        room={home.room}
        template={template}
        player={player}
        people={people}
        hotspots={hotspots}
        busy={busy}
        status={status}
        goal={goal}
      />
      {rooms.length > 1 && (
        <Suspense fallback={null}>
          <PrebakeRooms templates={rooms} />
        </Suspense>
      )}
    </>
  );
}
