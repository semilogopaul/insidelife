'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { aircraftIdOfLocation, isGatId, type GatId, type OwnedAircraftDto, type PresencePlayerDto } from '@insidelife/shared';
import { useAboard, useAircraftBoarding, useApron, useFlightPassengers, useFlightsState, useOwnFleet } from '@/common/aviation';
import { gameClock } from '@/common/game/game-clock';
import { useSnapshot } from '@/common/game/snapshot';
import type { AircraftClass } from '../contract';
import { aircraftTemplateId, type AircraftTemplateId } from '../cabin/cabin-layouts';
import type { AirsideProps } from '../terminal/Apron';
import { apronPlanes, chooseStand, flightKey, parkedHere, passengerPresence, resolveFlight, skyDuration, type FlightKind } from './flight-plan';

/** What the world shows in place of (or on top of) the venue interior when flying is involved. */
export type AviationScene =
  /** Nothing special: the venue's own interior. */
  | { readonly kind: 'none' }
  /** A General Aviation Terminal: the apron outside carries the planes (yours on your stand, others' beside it). */
  | { readonly kind: 'terminal'; readonly gat: GatId; readonly airside: AirsideProps; readonly parked: readonly OwnedAircraftDto[]; readonly onStand: OwnedAircraftDto | null; readonly hangared: number }
  /** Sitting in a plane: parked on the stand, or in the air after the sky sequence. */
  | {
      readonly kind: 'cabin';
      readonly templateId: AircraftTemplateId;
      readonly cls: AircraftClass;
      /** Your plane (null on an airliner). */
      readonly plane: OwnedAircraftDto | null;
      /** The flight you are on, when airborne. */
      readonly flight: FlightKind | null;
      readonly arriveAt: number | null;
      readonly players: readonly PresencePlayerDto[];
    }
  /** The flight itself: take-off, cruise, landing. */
  | { readonly kind: 'sky'; readonly key: string; readonly flight: FlightKind; readonly durationMs: number; readonly arriveAt: number };

const NO_PLAYERS: readonly PresencePlayerDto[] = [];
const NO_PLANES: readonly OwnedAircraftDto[] = [];

const msUntil = (gameMinute: number): number => gameClock.localMsAt(gameMinute) - gameClock.serverNow();

/**
 * Decides what the world shows for flying (see `AviationScene`), from the snapshot, your fleet, the terminal's apron and
 * the flights overview. Cheap when you aren't near an aircraft: the fleet and flights are only fetched at a General
 * Aviation Terminal, at an airport, or in the air.
 */
export function useAviationScene(): AviationScene {
  const { data: snapshot } = useSnapshot();
  const aboardId = useAboard((state) => state.aircraftId);
  const syncing = useAboard((state) => state.syncing);
  const boarding = useAircraftBoarding();
  const chosenId = useAboard((state) => state.chosenId);
  const skipped = useAboard((state) => state.skippedFlight);
  const travel = snapshot?.travel ?? null;
  const flying = travel?.mode === 'flight';
  const locationId = snapshot?.character.locationId ?? null;
  // Aboard your plane the server's location is `aircraft:<id>`; the terminal you are at is where that plane is parked.
  const sittingIn = locationId ? aircraftIdOfLocation(locationId) : null;
  const fleet = useOwnFleet((!travel && locationId !== null && isGatId(locationId)) || flying || sittingIn !== null);
  const flights = useFlightsState(flying);
  const mine = fleet.data?.mine ?? NO_PLANES;
  const serverAboard = !travel && sittingIn !== null ? (mine.find((plane) => plane.id === sittingIn) ?? null) : null;
  const gat: GatId | null = !travel ? (locationId && isGatId(locationId) ? locationId : (serverAboard?.parkedAt ?? null)) : null;
  const apron = useApron(serverAboard ? null : gat);

  const flight = useMemo(() => (travel && flying ? resolveFlight(flights.data?.bookings, mine, travel.arriveAt) : null), [travel, flying, flights.data, mine]);
  const key = travel && flying ? flightKey(travel) : null;
  const passengers = useFlightPassengers(flight?.kind === 'commercial' ? flight.booking.flight.id : null);
  const cabinPeople = useMemo(() => (passengers.data && locationId ? passengerPresence(passengers.data.passengers, locationId) : NO_PLAYERS), [passengers.data, locationId]);

  // How long the sky plays is fixed when the flight begins (the scene must not restart as the clock ticks).
  const [frozen, setFrozen] = useState<{ readonly key: string; readonly ms: number } | null>(null);
  const wanted = key !== null && travel !== null && flight !== null && skipped !== key ? key : null;
  if (wanted !== null && frozen?.key !== wanted && travel) setFrozen({ key: wanted, ms: skyDuration(msUntil(travel.arriveAt)) });

  const parked = useMemo(() => parkedHere(mine, gat), [mine, gat]);
  const split = useMemo(() => chooseStand(parked, chosenId), [parked, chosenId]);
  const placed = useMemo(() => apronPlanes(split, apron.data?.planes ?? []), [split, apron.data]);
  const standId = split.own?.id ?? null;
  const board = boarding.board;
  const onBoard = useCallback(() => {
    if (standId) board(standId);
  }, [standId, board]);
  const airside = useMemo<AirsideProps>(() => ({ own: placed.own, others: placed.others, onBoard }), [placed, onBoard]);

  // The plane you were sitting in has gone (it took off, or you were moved): forget the boarding.
  const aboardPlane = aboardId ? parked.find((plane) => plane.id === aboardId) ?? null : null;
  const lostPlane = aboardId !== null && !syncing && !flying && fleet.isSuccess && (gat === null || aboardPlane === null);
  useEffect(() => {
    if (lostPlane) useAboard.getState().reset();
  }, [lostPlane]);
  // The server is the truth for where you sit (a reload, another device, the autopilot taking you home): follow it
  // whenever no boarding request is on its way.
  const followed = serverAboard?.id ?? null;
  useEffect(() => {
    if (syncing || flying || !fleet.isSuccess || useAboard.getState().aircraftId === followed) return;
    useAboard.getState().follow(followed);
  }, [syncing, flying, fleet.isSuccess, followed]);
  // Taking off ends the boarding: the cabin you fly in comes from the flight itself.
  useEffect(() => {
    if (flying && useAboard.getState().aircraftId) useAboard.getState().reset();
  }, [flying]);

  return useMemo<AviationScene>(() => {
    if (flying && travel && flight && key) {
      const playSky = frozen?.key === key && frozen.ms > 0 && skipped !== key;
      if (playSky) return { kind: 'sky', key, flight, durationMs: frozen.ms, arriveAt: travel.arriveAt };
      return {
        kind: 'cabin',
        templateId: aircraftTemplateId(flight.cls),
        cls: flight.cls,
        plane: flight.kind === 'private' ? flight.aircraft : null,
        flight,
        arriveAt: travel.arriveAt,
        players: cabinPeople,
      };
    }
    if (gat) {
      if (aboardPlane) {
        return { kind: 'cabin', templateId: aircraftTemplateId(aboardPlane.aircraftClass), cls: aboardPlane.aircraftClass, plane: aboardPlane, flight: null, arriveAt: null, players: NO_PLAYERS };
      }
      return { kind: 'terminal', gat, airside, parked, onStand: split.own, hangared: apron.data?.hangared ?? 0 };
    }
    return { kind: 'none' };
  }, [flying, travel, flight, key, frozen, skipped, cabinPeople, gat, aboardPlane, airside, parked, split.own, apron.data]);
}

