'use client';

import { create } from 'zustand';
import type { WorldPoint } from '@insidelife/shared';

/** How the player is present in the 3D world right now. */
export type PlayerMode = 'loading' | 'inside' | 'walking' | 'driving' | 'riding';

/** Something the player can act on nearby (shown as the HUD context button). */
export interface Interactable {
  readonly id: string;
  readonly kind: 'door' | 'car' | 'player' | 'npc' | 'billboard';
  readonly label: string;
  /** Location id for doors. */
  readonly locationId?: string;
}

export interface DriveTelemetry {
  /** km/h shown on the speedometer. */
  readonly speedKmh: number;
  /** Estimated fuel cost of this drive so far (₦), charged by the server on heartbeat/arrival. */
  readonly tripFuelCost: number;
}

interface WorldState {
  readonly mode: PlayerMode;
  readonly position: WorldPoint | null;
  readonly heading: number;
  readonly districtName: string | null;
  readonly streetName: string | null;
  readonly nearby: Interactable | null;
  readonly drive: DriveTelemetry | null;
  setMode(mode: PlayerMode): void;
  /** Written by the world at a low rate (≈5 Hz) — never per frame. */
  setPose(position: WorldPoint, heading: number, districtName: string | null, streetName: string | null): void;
  setNearby(nearby: Interactable | null): void;
  setDrive(drive: DriveTelemetry | null): void;
}

/**
 * The world feature publishes what the HUD needs; the HUD dispatches intents back through `gameEvents`.
 * Per-frame values (exact transforms) stay inside the world's refs.
 */
export const useWorld = create<WorldState>()((set) => ({
  mode: 'loading',
  position: null,
  heading: 0,
  districtName: null,
  streetName: null,
  nearby: null,
  drive: null,
  setMode: (mode) => set({ mode }),
  setPose: (position, heading, districtName, streetName) => set({ position, heading, districtName, streetName }),
  setNearby: (nearby) => set({ nearby }),
  setDrive: (drive) => set({ drive }),
}));
