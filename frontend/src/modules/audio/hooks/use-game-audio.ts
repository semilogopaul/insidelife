'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { districtAt, type CharacterSnapshotDto } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { ALWAYS_DAYLIGHT } from '@/common/game/daylight';
import { gameClock } from '@/common/game/game-clock';
import { gameEvents } from '@/common/game/game-events';
import { useWorld, type PlayerMode } from '@/common/game/world-store';
import { deriveAmbience } from '../services/ambience/ambience-state';
import type { AudioEngine } from '../services/engine/audio-engine';
import { resolveScene, sceneKey, type MusicOverride, type SceneInputs } from '../services/scene/audio-scene';

const SCENE_INTERVAL_MS = 1000;
const VEHICLE_INTERVAL_MS = 100;

const isVehicleMode = (mode: PlayerMode): mode is 'driving' | 'riding' => mode === 'driving' || mode === 'riding';

/** One-shot events from any feature: `sfx`, `celebrate`, `speak`. */
export function useAudioEvents(engine: AudioEngine | null): void {
  useEffect(() => {
    if (!engine) return;
    const offs = [
      gameEvents.on('sfx', ({ id, volume }) => {
        engine.playSfx(id, volume);
      }),
      gameEvents.on('celebrate', ({ kind }) => {
        engine.celebrate(kind);
      }),
      gameEvents.on('speak', ({ text }) => {
        engine.speak(text);
      }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [engine]);
}

/**
 * The scene: where the player is (sampled at 1 Hz, immediately on mode changes and `music-context` requests) drives
 * music and ambience; the vehicle engine follows the speedometer at 10 Hz while in a vehicle. Reads stores with
 * `getState()` so the director never re-renders.
 */
export function useSceneAudio(engine: AudioEngine | null): void {
  const client = useQueryClient();

  useEffect(() => {
    if (!engine) return;
    let override: MusicOverride | null = null;

    const readInputs = (): SceneInputs => {
      const world = useWorld.getState();
      const snapshot = client.getQueryData<CharacterSnapshotDto>(queryKeys.snapshot);
      return {
        mode: world.mode,
        locationId: snapshot?.character.locationId ?? null,
        homeDistrictId: snapshot?.character.homeDistrictId ?? null,
        positionDistrictId: world.position ? districtAt(world.position) : null,
        gameMinute: gameClock.now(),
        alwaysDaylight: ALWAYS_DAYLIGHT,
      };
    };

    const syncScene = (): void => {
      const inputs = readInputs();
      if (override && override.key !== sceneKey(inputs)) override = null;
      const scene = resolveScene(inputs, override);
      engine.setMusic({ context: scene.context, night: scene.night, energy: scene.energy, clubVenueId: scene.clubVenueId });
      engine.setAmbience(
        deriveAmbience({
          gameMinute: inputs.gameMinute,
          worldSeed: gameClock.worldSeed,
          kind: scene.kind,
          placeType: scene.placeType,
          districtId: scene.districtId,
          driving: scene.driving,
          alwaysDaylight: inputs.alwaysDaylight,
        }),
        scene.kind === 'inside',
      );
    };

    // Vehicle engine: only polls while in a vehicle.
    let vehicleTimer: number | null = null;
    const riddenAt = performance.now();
    const sampleVehicle = (): void => {
      const { mode, drive } = useWorld.getState();
      if (mode === 'driving') engine.setVehicle('driving', drive?.speedKmh ?? 0);
      else if (mode === 'riding') {
        // Passenger: the driver's speed isn't published, so ride a plausible Lagos stop-start curve.
        const s = (performance.now() - riddenAt) / 1000;
        engine.setVehicle('riding', drive?.speedKmh ?? Math.max(0, 32 + 22 * Math.sin(s / 5.3) + 8 * Math.sin(s / 1.7)));
      }
    };
    const syncVehicle = (mode: PlayerMode): void => {
      if (isVehicleMode(mode)) {
        sampleVehicle();
        vehicleTimer ??= window.setInterval(sampleVehicle, VEHICLE_INTERVAL_MS);
      } else {
        if (vehicleTimer !== null) window.clearInterval(vehicleTimer);
        vehicleTimer = null;
        engine.setVehicle(null, 0);
      }
    };

    const offs = [
      gameEvents.on('music-context', ({ context, venueId }) => {
        override = { context, venueId: venueId ?? null, key: sceneKey(readInputs()) };
        syncScene();
      }),
      useWorld.subscribe((state, previous) => {
        if (state.mode !== previous.mode) {
          syncScene();
          syncVehicle(state.mode);
        }
      }),
      gameClock.subscribe(syncScene),
    ];

    syncScene();
    syncVehicle(useWorld.getState().mode);
    const sceneTimer = window.setInterval(syncScene, SCENE_INTERVAL_MS);

    return () => {
      for (const off of offs) off();
      window.clearInterval(sceneTimer);
      if (vehicleTimer !== null) window.clearInterval(vehicleTimer);
      engine.setVehicle(null, 0);
      engine.setMusic(null);
    };
  }, [engine, client]);
}
