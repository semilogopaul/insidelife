'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { DISTRICTS, ENTRY_RADIUS, MINUTES_PER_DAY, districtAt, fuelRangeKm, fuelStationDry, servicePointAt, streetNameAt, vehicleWarnings, type OpenWorldMode } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { gameClock } from '@/common/game/game-clock';
import { toast } from '@/common/components';
import { useNavigation } from '@/common/game/navigation-store';
import { useWorld, type Interactable } from '@/common/game/world-store';
import { getSocket } from '@/common/realtime/socket';
import { handleOf } from '../players/presence-directory';
import type { PlayRuntime } from '../runtime/play-runtime';
import { pickContext, type ContextCandidate } from './context-priority';
import { doorLabel, nearestDoor, type Door } from './doors';
import { movementApi } from './movement.api';
import { usePlayUi } from '../state/play-ui-store';
import { serviceOffer } from './service-offers';
import { savePose } from './spawn-handoff';

export const CAR_ENTER_ID = 'play:car:enter';
export const CAR_EXIT_ID = 'play:car:exit';
export const doorId = (locationId: string): string => `play:door:${locationId}`;
export const playerTargetId = (characterId: string): string => `play:player:${characterId}`;

/** Doors prompt within this distance on foot (the server accepts up to ENTRY_RADIUS). */
const DOOR_PROMPT_RADIUS = 7;
const PLAYER_PROMPT_SECONDS = 6;
const HEARTBEAT_MS = 15_000;
const MIN_HEARTBEAT_GAP_MS = 4_000;
/** Stopped (m/s) enough for the pump attendant or the mechanic. */
const SERVICE_STOP_SPEED = 2.5;
/** …and an offer already showing stays up to this speed (m/s; reversing on the brake reaches ~4). */
const OFFER_KEEP_SPEED = 6;

export interface WorldSyncOptions {
  /** A real session (heartbeats, positions); false in the dev sandbox. */
  readonly online: boolean;
  readonly characterId: string | null;
  readonly homeDoor: Door | null;
  /** Doors of hosts whose invite you accepted. */
  readonly visitDoors: readonly Door[];
  /** ₦ per litre of petrol right now (scarcity included). */
  readonly fuelPrice: number;
  readonly priceIndex: number;
  /** Fuel scarcity is on (some stations are dry today). */
  readonly scarcity: boolean;
}

function privateDoors(options: WorldSyncOptions): readonly Door[] {
  return options.homeDoor ? [options.homeDoor, ...options.visitDoors] : options.visitDoors;
}

function isTouchDevice(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}

const sameNearby = (a: Interactable | null, b: Interactable | null): boolean =>
  a?.id === b?.id && a?.choices === b?.choices && a?.label === b?.label && a?.disabled === b?.disabled && a?.more?.map((option) => `${option.id}|${option.label}|${option.disabled ?? ''}`).join() === b?.more?.map((option) => `${option.id}|${option.label}|${option.disabled ?? ''}`).join();

/** "Get out" next to "Park & enter …" (a mouse has no other way to get out where every kerb is near a door). */
const GET_OUT_OPTION = { id: CAR_EXIT_ID, label: 'Get out', emoji: '🚪' } as const;

/**
 * `POST /characters/me/heartbeats`: every 15 s while outside and on walking ↔ driving switches, never closer than 4 s
 * (the API allows 20 a minute). A rejected move refreshes the snapshot; a car the server keeps refusing is parked.
 */
export class Heartbeats {
  online = false;
  private last = 0;
  private pending: OpenWorldMode | null = null;
  private rejected = 0;
  private inFlight = false;
  private readonly runtime: PlayRuntime;
  private readonly onRejected: () => void;

  constructor(runtime: PlayRuntime, onRejected: () => void) {
    this.runtime = runtime;
    this.onRejected = onRejected;
  }

  setOnline(online: boolean): void {
    this.online = online;
  }

  /** Send now (or as soon as allowed). */
  send(mode?: OpenWorldMode): void {
    const runtime = this.runtime;
    if (!this.online || runtime.mode === 'ride') return;
    const now = Date.now();
    const wanted: OpenWorldMode = mode ?? (runtime.mode === 'drive' ? 'car' : 'walk');
    if (this.inFlight || now - this.last < MIN_HEARTBEAT_GAP_MS) {
      this.pending = wanted;
      return;
    }
    this.last = now;
    this.pending = null;
    this.inFlight = true;
    const bumps = wanted === 'car' ? Math.round(runtime.bumps * 10) / 10 : 0;
    runtime.bumps = 0;
    movementApi
      .heartbeat({ position: { x: runtime.controller.x, z: runtime.controller.z }, mode: wanted, heading: runtime.controller.heading, ...(bumps > 0 ? { bumps } : {}) })
      .then(({ accepted, car }) => {
        // The server's tank and condition (fuel burnt, a breakdown rolled): the engine dies here if it says so.
        if (car) runtime.controller.applyCarStatus(car);
        if (accepted) {
          this.rejected = 0;
          return;
        }
        this.rejected++;
        this.onRejected();
        if (wanted === 'car' && this.rejected >= 3 && runtime.mode === 'drive' && !runtime.controller.engineOff) {
          this.rejected = 0;
          toast({ title: 'The car won’t go on', body: 'Park up and continue on foot — check Motors on your phone.', tone: 'bad' });
          runtime.requestExitCar();
        }
      })
      .catch(() => undefined)
      .finally(() => {
        this.inFlight = false;
      });
  }

  /** Called every second: the 15 s beat, or a postponed one. */
  tick(): void {
    const since = Date.now() - this.last;
    if (since >= HEARTBEAT_MS || (this.pending !== null && since >= MIN_HEARTBEAT_GAP_MS)) this.send(this.pending ?? undefined);
  }
}

/** The open world's low-rate side: HUD pose, context button, drive telemetry, `world:move`, heartbeats. */
export function useWorldSync(runtime: PlayRuntime, options: WorldSyncOptions): Heartbeats {
  const client = useQueryClient();
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  // The server sees things differently (taken inside, car unavailable): refresh our view of the character.
  const [heartbeats] = useState(() => new Heartbeats(runtime, () => void client.invalidateQueries({ queryKey: queryKeys.snapshot }, { cancelRefetch: false })));
  useEffect(() => {
    heartbeats.setOnline(options.online);
  }, [heartbeats, options.online]);

  useEffect(() => {
    const world = useWorld.getState;
    const touchUi = isTouchDevice();
    // Infinity, not NaN: the first comparison must publish (NaN compares false, so the pose would never go out).
    let lastX = Number.POSITIVE_INFINITY;
    let lastZ = Number.POSITIVE_INFINITY;
    let lastSent = 0;
    let choiceKey = '';

    // ≈5 Hz: pose for the HUD, the context button, the speedometer.
    const pose = window.setInterval(() => {
      const c = runtime.controller;
      const x = runtime.subjectX;
      const z = runtime.subjectZ;
      if (Math.abs(x - lastX) > 0.05 || Math.abs(z - lastZ) > 0.05) {
        lastX = x;
        lastZ = z;
        const point = { x, z };
        const district = DISTRICTS[districtAt(point)]?.name ?? null;
        const street = streetNameAt(point);
        world().setPose(point, runtime.subjectHeading, district, street);
      }

      // Context button.
      let next: Interactable | null = null;
      let driveOffer: Interactable | null = null;
      const prices = { fuelPrice: optionsRef.current.fuelPrice, priceIndex: optionsRef.current.priceIndex };
      // A filling station or mechanic you've pulled up at (on foot too: a jerrycan from the pump for a dead car).
      const atService = (x: number, z: number): { readonly offer: Interactable; readonly distance: number } | null => {
        if (!c.car) return null;
        const point = servicePointAt('fuel', { x, z }) ?? servicePointAt('mechanic', { x, z });
        if (!point) return null;
        const dry = point.kind === 'fuel' && fuelStationDry(gameClock.worldSeed, point.id, Math.floor(gameClock.now() / MINUTES_PER_DAY), optionsRef.current.scarcity);
        return { offer: serviceOffer(point, c.car, { ...prices, dry }), distance: Math.hypot(point.entrance.position.x - x, point.entrance.position.z - z) };
      };
      if (runtime.mode === 'walk') {
        const destinationId = useNavigation.getState().destinationId;
        const door = nearestDoor({ x: c.walker.x, z: c.walker.z }, ENTRY_RADIUS, privateDoors(optionsRef.current));
        const doorDistance = door ? Math.hypot(door.x - c.walker.x, door.z - c.walker.z) : Number.POSITIVE_INFINITY;
        const doorClose = door && (doorDistance <= DOOR_PROMPT_RADIUS || door.locationId === destinationId);
        const selected = runtime.selectedPlayer && performance.now() - runtime.selectedAt < PLAYER_PROMPT_SECONDS * 1000 ? runtime.selectedPlayer : null;
        const service = atService(c.walker.x, c.walker.z);
        const canCar = c.canEnterCar();
        // A player you just tapped wins for a few seconds (explicit intent). Otherwise the most useful thing in reach:
        // something you can do beats something you can't, a door (or your car) beats a pump or mechanic, then the
        // nearest. Two things you can do: the player switches between them.
        if (selected) next = { id: playerTargetId(selected), kind: 'player', label: `@${handleOf(selected)}` };
        else {
          const candidates: ContextCandidate[] = [];
          if (service) {
            const offer = service.offer;
            candidates.push({ item: canCar ? { ...offer, more: [...(offer.more ?? []), { id: CAR_ENTER_ID, label: 'Get in car', emoji: '🚗' }] } : offer, distance: service.distance, entrance: false });
          }
          if (canCar && (!service || service.offer.disabled)) candidates.push({ item: { id: CAR_ENTER_ID, kind: 'car', label: 'Get in car' }, distance: c.distanceToCar(), entrance: true });
          if (door && doorClose) {
            candidates.push({ item: { id: doorId(door.locationId), kind: 'door', label: doorLabel(door, false, door === optionsRef.current.homeDoor), locationId: door.locationId }, distance: doorDistance, entrance: true });
          }
          // A new set of choices starts from the best again.
          const key = candidates.map((candidate) => candidate.item.id).join('|');
          if (key !== choiceKey) {
            choiceKey = key;
            if (world().choice !== 0) world().setChoice(0);
          }
          next = pickContext(candidates, key === choiceKey ? world().choice : 0);
        }
      } else if (runtime.mode === 'drive') {
        // Shown once you've (nearly) stopped, and kept while you creep or the brake starts reversing you, so it never
        // vanishes under the thumb going for it.
        const offered = (touchUi ? usePlayUi.getState().driveOffer : world().nearby) !== null && world().nearby?.id !== CAR_EXIT_ID;
        const slow = Math.abs(c.speed) < (offered ? OFFER_KEEP_SPEED : SERVICE_STOP_SPEED);
        const door = slow ? nearestDoor({ x: c.x, z: c.z }, ENTRY_RADIUS - 1, privateDoors(optionsRef.current)) : null;
        const driveService: Interactable | null = slow ? (atService(c.x, c.z)?.offer ?? null) : null;
        const offer: Interactable | null =
          driveService ??
          (door ? { id: doorId(door.locationId), kind: 'door', label: doorLabel(door, true, door === optionsRef.current.homeDoor), locationId: door.locationId } : null);
        // Touch screens: the drive controls show the offer next to their own "Get out" (HUD hidden or not). With a
        // mouse, the context button offers it with "Get out" as a second choice (keys E, 1–2; F gets out too).
        if (touchUi) driveOffer = offer;
        else next = offer ? { ...offer, more: [...(offer.more ?? []), GET_OUT_OPTION] } : { id: CAR_EXIT_ID, kind: 'car', label: 'Get out' };
      }
      if (!sameNearby(world().nearby, next)) world().setNearby(next);
      if (!sameNearby(usePlayUi.getState().driveOffer, driveOffer)) usePlayUi.getState().setDriveOffer(driveOffer);

      // Speedometer, fuel gauge and the engine light.
      if (runtime.mode === 'drive' && c.car) {
        const { running, vehicle } = c.car;
        const fuelLitres = Math.round(running.fuelLitres * 10) / 10;
        const rangeKm = fuelRangeKm(vehicle, fuelLitres);
        const warning = vehicleWarnings({ fuelLitres, tankLitres: running.tankLitres, rangeKm, condition: running.condition, brokenDown: running.brokenDown })[0] ?? null;
        const next = { speedKmh: Math.round(Math.abs(c.speed) * 3.6), fuelLitres, tankLitres: running.tankLitres, rangeKm: Math.round(rangeKm), condition: Math.round(running.condition), engineOff: c.engineOff, warning };
        const drive = world().drive;
        if (!drive || drive.speedKmh !== next.speedKmh || drive.fuelLitres !== next.fuelLitres || drive.condition !== next.condition || drive.engineOff !== next.engineOff || drive.warning?.text !== next.warning?.text) {
          world().setDrive(next);
        }
      } else if (world().drive) {
        world().setDrive(null);
      }
    }, 200);

    // 4 Hz: positions for other players (visual only).
    const move = window.setInterval(() => {
      if (!optionsRef.current.online) return;
      const socket = getSocket();
      if (!socket.connected) return;
      const speed = Math.abs(runtime.subjectSpeed);
      const now = performance.now();
      if (speed < 0.05 && now - lastSent < 2000) return;
      lastSent = now;
      const mode = runtime.mode === 'walk' || runtime.ride.onFoot ? 'walk' : 'car';
      const car = mode === 'car' && runtime.mode === 'drive' ? runtime.controller.car?.vehicle : undefined;
      socket.emit('world:move', {
        x: Math.round(runtime.subjectX * 100) / 100,
        z: Math.round(runtime.subjectZ * 100) / 100,
        heading: Math.round(runtime.subjectHeading * 1000) / 1000,
        mode,
        speed: Math.round(speed * 100) / 100,
        ...(car ? { vehicle: { model: car.model, color: car.color } } : {}),
      });
    }, 250);

    // Heartbeats keep "exploring" alive and pay for fuel; the pose is saved for reloads.
    const heartbeat = window.setInterval(() => {
      heartbeats.tick();
      const { characterId } = optionsRef.current;
      if (characterId && runtime.mode !== 'ride') {
        const c = runtime.controller;
        savePose({
          characterId,
          x: c.walker.x,
          z: c.walker.z,
          heading: c.walker.heading,
          driving: runtime.mode === 'drive',
          car: c.car ? { x: c.car.state.x, z: c.car.state.z, heading: c.car.state.heading, vehicle: c.car.vehicle } : null,
          savedAt: Date.now(),
        });
      }
    }, 1000);

    return () => {
      window.clearInterval(pose);
      window.clearInterval(move);
      window.clearInterval(heartbeat);
      const current = world().nearby;
      if (current?.id.startsWith('play:')) world().setNearby(null);
      usePlayUi.getState().setDriveOffer(null);
      world().setDrive(null);
    };
  }, [runtime, heartbeats]);

  return heartbeats;
}
