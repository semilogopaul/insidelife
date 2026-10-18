'use client';

import { create } from 'zustand';
import type { VehicleWarning, WorldPoint } from '@insidelife/shared';

/** How the player is present in the 3D world right now. */
export type PlayerMode = 'loading' | 'inside' | 'walking' | 'driving' | 'riding';

/** One more thing to do at the same spot (a smaller button above the context button). */
export interface InteractableOption {
  readonly id: string;
  readonly label: string;
  readonly emoji?: string;
  /** Why it can't be done right now (shown greyed out; pressing it explains). */
  readonly disabled?: string;
}

/** Something the player can act on nearby (shown as the HUD context button). */
export interface Interactable {
  readonly id: string;
  /** `activity`: a hotspot indoors ("Drinks at the lounge · ₦18,000"). */
  readonly kind: 'door' | 'car' | 'player' | 'npc' | 'billboard' | 'activity';
  readonly label: string;
  /** Location id for doors. */
  readonly locationId?: string;
  /** Shown before the label (decorative). */
  readonly emoji?: string;
  /** Why it can't be done right now (shown greyed out; pressing it explains). */
  readonly disabled?: string;
  /** Other things to do right here; each emits `interact` with its own id. */
  readonly more?: readonly InteractableOption[];
  /** More than one enabled option is in range (this many): the HUD offers a "next" chevron (`cycleChoice`). */
  readonly choices?: number;
  /** Tap/click only: the E key never triggers it (so nobody leaves a room by accident). */
  readonly noKey?: boolean;
}

export interface DriveTelemetry {
  /** km/h shown on the speedometer. */
  readonly speedKmh: number;
  /** The tank (litres, the server's as of the last heartbeat minus what's been burnt since). */
  readonly fuelLitres: number;
  readonly tankLitres: number;
  /** Map km left on the tank. */
  readonly rangeKm: number;
  /** 0-100. */
  readonly condition: number;
  /** The engine won't run (out of fuel, broken down): it can only be pushed. */
  readonly engineOff: boolean;
  /** The most urgent problem ("Fuel low: 12 km left"), or null. */
  readonly warning: VehicleWarning | null;
}

interface WorldState {
  readonly mode: PlayerMode;
  readonly position: WorldPoint | null;
  readonly heading: number;
  readonly districtName: string | null;
  readonly streetName: string | null;
  readonly nearby: Interactable | null;
  /** Which of the enabled options in range is showing (the player's "next" taps). */
  readonly choice: number;
  readonly drive: DriveTelemetry | null;
  setMode(mode: PlayerMode): void;
  /** Written by the world at a low rate (≈5 Hz) — never per frame. */
  setPose(position: WorldPoint, heading: number, districtName: string | null, streetName: string | null): void;
  setNearby(nearby: Interactable | null): void;
  setChoice(choice: number): void;
  /** Switch to the next enabled option in range. */
  cycleChoice(): void;
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
  choice: 0,
  drive: null,
  setMode: (mode) => set({ mode }),
  setPose: (position, heading, districtName, streetName) => set({ position, heading, districtName, streetName }),
  setNearby: (nearby) => set({ nearby }),
  setChoice: (choice) => set({ choice }),
  cycleChoice: () => set((state) => ({ choice: state.choice + 1 })),
  setDrive: (drive) => set({ drive }),
}));
