'use client';

import { homeEntrance, type DistrictId, type DrivenVehicleDto } from '@insidelife/shared';
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Color, MeshBasicMaterial, PerspectiveCamera, RingGeometry } from 'three';
import { useWorldState } from '@/common/game/use-game-clock';
import { useSnapshot } from '@/common/game/snapshot';
import { useUi } from '@/common/game/ui-store';
import { useWorld } from '@/common/game/world-store';
import { PAVEMENT_Y } from '../city/layout/placements';
import { setProps } from '../city/lib/mutate';
import type { QualityProfile } from '../city/lib/quality';
import { BillboardTracker } from './billboards/BillboardTracker';
import { BlobShadows } from './effects/blob-shadows';
import { useMoneyBurst } from './effects/MoneyBurst';
import { SprayListener } from './effects/SprayListener';
import type { Door } from './flow/doors';
import { primaryCar } from './flow/movement.api';
import { loadPose, spawnHandoff } from './flow/spawn-handoff';
import { resolveStart, stepOut, type SandboxStart } from './flow/start-pose';
import { useWorldActions } from './flow/use-world-actions';
import { useWorldSync } from './flow/use-world-sync';
import { resetControls } from './input/controls';
import { TapHandler } from './interaction/TapHandler';
import { Pedestrians } from './pedestrians/Pedestrians';
import { cityColliders } from './physics/obstacles';
import { PlayerAvatar, type PlayerLook } from './player/PlayerAvatar';
import { PlayerCar } from './player/PlayerCar';
import { OtherPlayers, RemoteFeed } from './players/OtherPlayers';
import { RemotePlayers } from './players/remote-players';
import { RideLayer } from './ride/RideLayer';
import { PlayRuntime } from './runtime/play-runtime';
import { usePlayUi } from './state/play-ui-store';
import { TrafficLayer } from './traffic/TrafficLayer';
import { preloadVehicleKit } from './vehicles/vehicle-kit';
import { VehicleKitProvider } from './vehicles/VehicleKitProvider';
import { exposeDevHook } from './lib/dev-hook';
import { useDisposeOnUnmount } from './lib/use-dispose';

// Cars are small (~35 kB each): fetch them with the world chunk so stepping outside is instant.
preloadVehicleKit();

/** The play layer owns the camera outside (the review camera only runs in the dev city viewer). */
export const PLAY_LAYER_OWNS_CAMERA = true;

export interface PlayLayerProps {
  readonly quality: QualityProfile;
  /** Dev sandbox (no session): start at a venue door with an optional car; no server calls. */
  readonly sandbox?: SandboxStart | null;
}

const TRAFFIC = { low: 6, medium: 14, high: 24 } as const;
const PEDESTRIANS = { low: 3, medium: 6, high: 10 } as const;
const REMOTE_AVATARS = { low: 4, medium: 8, high: 12 } as const;
const REMOTE_BLOBS = 12;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function Director({ runtime }: { readonly runtime: PlayRuntime }) {
  const get = useThree((state) => state.get);
  useEffect(() => exposeDevHook(runtime, () => get().camera, () => get().size), [runtime, get]);
  useFrame((state, delta) => {
    if (state.camera instanceof PerspectiveCamera) runtime.frame(state.camera, Math.min(delta, 0.05), performance.now());
  }, -4);
  return null;
}

function BlobLayer({ blobs }: { readonly blobs: BlobShadows }) {
  useFrame(() => blobs.commit(), -2.5);
  useDisposeOnUnmount(blobs, () => blobs.dispose());
  return <primitive object={blobs.mesh} />;
}

/** A Danfo-yellow ring at your own front door (venues get theirs from the city). */
function HomeDoorRing({ door }: { readonly door: Door }) {
  const resources = useMemo(
    () => ({
      geometry: new RingGeometry(1.05, 1.4, 40).rotateX(-Math.PI / 2),
      material: new MeshBasicMaterial({ color: new Color('#f6b90b'), transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: false }),
    }),
    [],
  );
  useDisposeOnUnmount(resources, () => {
    resources.geometry.dispose();
    resources.material.dispose();
  });
  useFrame(({ clock }) => setProps(resources.material, { opacity: 0.42 + Math.sin(clock.elapsedTime * 2.2) * 0.18 }));
  return <mesh geometry={resources.geometry} material={resources.material} position={[door.x, PAVEMENT_Y + 0.03, door.z]} renderOrder={3} />;
}

function MoneyBurstLayer({ runtime, remotes, selfHandle, reducedMotion }: { readonly runtime: PlayRuntime; readonly remotes: RemotePlayers; readonly selfHandle: string | null; readonly reducedMotion: boolean }) {
  const burst = useMoneyBurst();
  return (
    <>
      <primitive object={burst.mesh} />
      <SprayListener runtime={runtime} remotes={remotes} burst={burst} selfHandle={selfHandle} reducedMotion={reducedMotion} />
    </>
  );
}

/**
 * Everything you do outside: walk (third-person orbit camera), drive your car (chase camera), ride a booked danfo,
 * enter and leave buildings (server-validated), and the living city around you — traffic, pedestrians, other
 * players, billboards. Rendered inside the world canvas while outside or riding.
 */
export function PlayLayer({ quality, sandbox = null }: PlayLayerProps) {
  const { data: snapshot } = useSnapshot();
  const online = sandbox === null && snapshot !== undefined;
  const character = snapshot?.character;
  const characterId = character?.id ?? null;
  const fuelPrice = useWorldState().data?.economy.fuelPrice ?? 1350;
  const invertSteering = useUi((state) => state.settings.invertSteering);
  const travel = snapshot?.travel ?? null;

  const homeDoor = useMemo<Door | null>(() => {
    if (!character) return null;
    const entrance = homeEntrance(character.id, character.homeDistrictId as DistrictId);
    return { locationId: `home:${character.id}`, name: 'Home', x: entrance.position.x, z: entrance.position.z };
  }, [character]);

  // Where we start: the door just used (handed over by whoever stepped outside), the pose before a reload, or a
  // pavement in our district. Read without consuming during render; consumed in an effect.
  const [start] = useState(() => resolveStart(snapshot, spawnHandoff.peek(), characterId ? loadPose(characterId) : null, sandbox));
  const [runtime] = useState(
    () =>
      new PlayRuntime({
        colliders: cityColliders(),
        trafficCapacity: TRAFFIC[quality.tier],
        seed: characterId ?? 'sandbox',
        reducedMotion: prefersReducedMotion(),
        x: start.x,
        z: start.z,
        heading: start.heading,
      }),
  );
  const [remotes] = useState(() => new RemotePlayers());
  const [blobs] = useState(() => new BlobShadows(PEDESTRIANS.high + REMOTE_BLOBS));
  const [car, setCar] = useState<DrivenVehicleDto | null>(start.car?.vehicle ?? null);

  useEffect(() => {
    remotes.setSelf(characterId);
  }, [remotes, characterId]);
  useEffect(() => {
    runtime.setInvertSteering(invertSteering);
  }, [runtime, invertSteering]);
  useEffect(() => {
    runtime.traffic.setTarget(TRAFFIC[quality.tier]);
  }, [runtime, quality.tier]);

  // Place the car (spawn, saved pose, or the garage) and step out of the door.
  useEffect(() => {
    spawnHandoff.take();
    const controller = runtime.controller;
    let cancelled = false;
    if (start.car) {
      controller.setCar(start.car.vehicle, start.car.x, start.car.z, start.car.heading);
      if (start.driving) runtime.enterCar();
    } else if (start.lookupCar && online) {
      primaryCar()
        .then((vehicle) => {
          if (cancelled || !vehicle || controller.car) return;
          controller.setCar(vehicle, start.parking.x, start.parking.z, start.parking.heading);
          setCar(vehicle);
        })
        .catch(() => undefined);
    }
    // A spawn that arrives just after we mounted (the snapshot beat the event): move to that door.
    const mountedAt = performance.now();
    const off = spawnHandoff.subscribe((offer) => {
      if (performance.now() - mountedAt > 4000 || runtime.mode !== 'walk') return;
      spawnHandoff.take();
      const { entrance, car: spawnCar } = offer.spawn;
      const out = stepOut(entrance);
      runtime.placeAtDoor(out.x, out.z, entrance.heading);
      if (spawnCar) {
        controller.setCar(spawnCar, entrance.parking.x, entrance.parking.z, entrance.parking.heading);
        setCar(spawnCar);
      }
    });
    usePlayUi.getState().setActive(true);
    usePlayUi.getState().setFading(false);
    // After the world canvas has set the coarse mode for this presence (parent effects run after ours).
    const modeTimer = window.setTimeout(() => {
      if (useWorld.getState().mode === 'riding') return;
      if (runtime.mode === 'drive') useWorld.getState().setMode('driving');
      else if (runtime.mode === 'walk') useWorld.getState().setMode('walking');
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(modeTimer);
      off();
      usePlayUi.getState().setActive(false);
      resetControls();
    };
  }, [runtime, start, online]);

  // Riding a booked trip (the ride layer moves the camera) vs. on your own feet/wheels.
  const riding = travel !== null;
  useEffect(() => {
    if (riding) useWorld.getState().setMode('riding');
    else if (useWorld.getState().mode === 'riding') useWorld.getState().setMode(runtime.mode === 'drive' ? 'driving' : 'walking');
  }, [runtime, riding]);

  const heartbeats = useWorldSync(runtime, { online, characterId, homeDoor, fuelPrice });
  useWorldActions(runtime, { online, heartbeats });

  const look: PlayerLook = character ? { appearance: character.appearance, outfit: character.outfit, gender: character.gender, mood: character.mood } : sandboxLook;
  const shadows = quality.shadows;
  const tier = quality.tier;
  return (
    <>
      <Director runtime={runtime} />
      <PlayerAvatar runtime={runtime} look={look} castShadow={shadows} />
      {homeDoor && <HomeDoorRing door={homeDoor} />}
      <BlobLayer blobs={blobs} />
      <Pedestrians runtime={runtime} count={PEDESTRIANS[tier]} seed={characterId ?? 'sandbox'} blobs={blobs} blobBase={0} />
      <Suspense fallback={null}>
        <VehicleKitProvider>
          <TrafficLayer runtime={runtime} castShadow={shadows} />
          {car && <PlayerCar runtime={runtime} vehicle={car} castShadow={shadows} />}
          {travel && snapshot && <RideLayer runtime={runtime} snapshot={snapshot} travel={travel} ownCar={car?.model ?? null} />}
          <OtherPlayers runtime={runtime} remotes={remotes} maxAvatars={REMOTE_AVATARS[tier]} blobs={blobs} blobBase={PEDESTRIANS.high} />
        </VehicleKitProvider>
      </Suspense>
      {online && <RemoteFeed remotes={remotes} />}
      <TapHandler runtime={runtime} remotes={remotes} online={online} />
      <BillboardTracker runtime={runtime} online={online} />
      <MoneyBurstLayer runtime={runtime} remotes={remotes} selfHandle={character?.handle ?? null} reducedMotion={runtime.reducedMotion} />
    </>
  );
}

/** A default look for the dev sandbox (no character). */
const sandboxLook: PlayerLook = {
  appearance: { bodyType: 'average', height: 1, skinTone: 3, hairStyle: 'fade', hairColor: 0, facialHair: 'stubble', eyeStyle: 'almond' },
  outfit: {},
  gender: 'male',
};
