'use client';

import {
  ENTRY_RADIUS,
  findRoute,
  findVenue,
  homeEntrance,
  homeLocationId,
  straightDistance,
  turnByTurn,
  venueEntrance,
  type CharacterSnapshotDto,
  type CityRoute,
  type DistrictId,
  type Entrance,
  type WorldPoint,
} from '@insidelife/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { gameEvents } from '@/common/game/game-events';
import { useNavigation, type NavigationInstruction } from '@/common/game/navigation-store';
import { useSnapshot } from '@/common/game/snapshot';
import { useWorld } from '@/common/game/world-store';
import { DestinationBeacon } from './DestinationBeacon';
import { etaSeconds, instructionText, projectOnRoute, upcomingManeuver, VoicePrompter, type TravelMode } from './guidance';
import { livePose, livePoseFresh } from './live-pose';
import { RouteRibbon } from './RouteRibbon';
import { setActiveRoute, activeRoute } from './route-state';

/**
 * GPS inside the world canvas. When `navigation-store.destinationId` is set it routes from the player to the
 * destination door (A* over the shared road graph), draws the ribbon and beacon, publishes guidance at ~4 Hz,
 * speaks prompts at 200 m / 50 m / now (walking: 50 m / now), re-routes after 25 m off-route and announces arrival
 * inside ENTRY_RADIUS of the door.
 */

const GUIDANCE_INTERVAL = 0.25;
const OFF_ROUTE_METRES = 25;
const OFF_ROUTE_SECONDS = 1.5;
const REROUTE_COOLDOWN = 3;
const CLEAR_AFTER_ARRIVAL_MS = 4000;

interface Destination {
  readonly id: string;
  readonly name: string;
  readonly entrance: Entrance;
}

/** Resolves a navigation destination id to a door (venues, or the player's own home). */
export function resolveDestination(id: string, name: string | null, snapshot: CharacterSnapshotDto | undefined): Destination | null {
  if (snapshot && id === homeLocationId(snapshot.character.id)) {
    return { id, name: name ?? 'home', entrance: homeEntrance(snapshot.character.id, snapshot.character.homeDistrictId as DistrictId) };
  }
  const entrance = venueEntrance(id);
  if (!entrance) return null;
  return { id, name: name ?? findVenue(id)?.name ?? 'your destination', entrance };
}

/** Where the player stands right now: live pose, else the published pose, else the door they came out of. */
function playerPoint(fallback: WorldPoint | null): WorldPoint | null {
  if (livePoseFresh()) return { x: livePose.x, z: livePose.z };
  return useWorld.getState().position ?? fallback;
}

function startFallback(snapshot: CharacterSnapshotDto | undefined): WorldPoint | null {
  if (!snapshot) return null;
  const { character } = snapshot;
  if (character.locationId === homeLocationId(character.id)) return homeEntrance(character.id, character.homeDistrictId as DistrictId).position;
  return venueEntrance(character.locationId)?.position ?? null;
}

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

export function NavigationLayer() {
  const destinationId = useNavigation((state) => state.destinationId);
  const destinationName = useNavigation((state) => state.destinationName);
  const { data: snapshot } = useSnapshot();
  // Depend on the few snapshot fields that matter so refetches don't reroute (and repeat voice prompts).
  const characterId = snapshot?.character.id;
  const homeDistrictId = snapshot?.character.homeDistrictId;
  const locationId = snapshot?.character.locationId;
  const destination = useMemo(
    () => (destinationId ? resolveDestination(destinationId, destinationName, snapshot) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [destinationId, destinationName, characterId, homeDistrictId],
  );
  // The drawn route, tagged with the destination it belongs to (stale routes are never drawn).
  const [drawn, setDrawn] = useState<{ readonly id: string; readonly route: CityRoute } | null>(null);

  const timers = useRef({ guidance: 0, offRoute: 0, sinceReroute: 0, arrived: false });
  const prompter = useRef(new VoicePrompter());
  const lastPublished = useRef('');
  /** Set by the frame loop when the player leaves the route; served by the router below. */
  const routeRequest = useRef<'none' | 'initial' | 'reroute'>('none');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fallback = useMemo(() => startFallback(snapshot), [characterId, homeDistrictId, locationId]);

  // Router: (re)computes the route off the frame loop as soon as the player's position is known.
  useEffect(() => {
    timers.current = { guidance: GUIDANCE_INTERVAL, offRoute: 0, sinceReroute: 0, arrived: false };
    prompter.current.reset();
    lastPublished.current = '';
    setActiveRoute(null, [], destination?.entrance.position ?? null, destination?.name ?? null);
    if (!destination) return;
    routeRequest.current = 'initial';
    const serve = (): void => {
      const request = routeRequest.current;
      if (request === 'none') return;
      const position = playerPoint(fallback);
      if (!position) return;
      routeRequest.current = 'none';
      const next = findRoute(position, destination.entrance.position);
      if (!next) return;
      setActiveRoute(next, turnByTurn(next, { destinationName: destination.name }), destination.entrance.position, destination.name);
      prompter.current.reset();
      setDrawn({ id: destination.id, route: next });
      if (request === 'reroute') gameEvents.emit('speak', { text: 'Rerouting' });
    };
    const id = window.setInterval(serve, 150);
    return () => window.clearInterval(id);
  }, [destination, fallback]);

  // Clear the published guidance when navigation ends or the layer unmounts (going inside).
  useEffect(() => {
    if (!destinationId) useNavigation.getState().setGuidance(null, null, null);
  }, [destinationId]);
  useEffect(() => () => setActiveRoute(null, [], null, null), []);

  useFrame((_, delta) => {
    const t = timers.current;
    if (!destination || t.arrived) return;
    const position = playerPoint(fallback);
    const current = activeRoute.route;
    if (!position || !current) return;
    t.sinceReroute += delta;
    t.guidance += delta;
    const progress = projectOnRoute(current, position, activeRoute.along);
    activeRoute.along = progress.along;

    // Off route for a while → ask the router for a new route from here.
    t.offRoute = progress.offRoute > OFF_ROUTE_METRES ? t.offRoute + delta : 0;
    if (t.offRoute > OFF_ROUTE_SECONDS && t.sinceReroute > REROUTE_COOLDOWN) {
      t.offRoute = 0;
      t.sinceReroute = 0;
      routeRequest.current = 'reroute';
      return;
    }

    if (t.guidance < GUIDANCE_INTERVAL) return;
    t.guidance = 0;
    const store = useNavigation.getState();
    const toDoor = straightDistance(position, destination.entrance.position);
    if (toDoor <= ENTRY_RADIUS) {
      t.arrived = true;
      const text = `You have arrived at ${destination.name}`;
      store.setGuidance({ text, maneuver: 'arrive', distance: 0 }, 0, 0);
      gameEvents.emit('speak', { text });
      gameEvents.emit('sfx', { id: 'ui-success' });
      const id = destination.id;
      window.setTimeout(() => {
        if (useNavigation.getState().destinationId === id) useNavigation.getState().setDestination(null);
      }, CLEAR_AFTER_ARRIVAL_MS);
      return;
    }

    const mode: TravelMode = useWorld.getState().mode === 'driving' || useWorld.getState().mode === 'riding' ? 'drive' : 'walk';
    const maneuver = upcomingManeuver(activeRoute.maneuvers, progress.along);
    if (!maneuver) return;
    const distance = Math.max(0, maneuver.at - progress.along);
    const remaining = Math.max(0, current.length - progress.along);
    const instruction: NavigationInstruction = { text: instructionText(maneuver, destination.name), maneuver: maneuver.kind, distance: roundTo(distance, 5) };
    const eta = roundTo(etaSeconds(remaining, livePoseFresh() ? livePose.speed : 0, mode), 5);
    const key = `${instruction.text}|${instruction.distance}|${roundTo(remaining, 10)}|${eta}`;
    if (key !== lastPublished.current) {
      lastPublished.current = key;
      store.setGuidance(instruction, roundTo(remaining, 10), eta);
    }
    const speech = prompter.current.next(maneuver, distance, mode);
    if (speech) gameEvents.emit('speak', { text: speech });
  });

  if (!destination) return null;
  return (
    <>
      {drawn && drawn.id === destination.id && <RouteRibbon route={drawn.route} />}
      <DestinationBeacon at={destination.entrance.position} />
    </>
  );
}
