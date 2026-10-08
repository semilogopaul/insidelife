'use client';

import { create } from 'zustand';

export interface NavigationInstruction {
  /** "Turn left onto Herbert Macaulay Way". */
  readonly text: string;
  readonly maneuver: 'depart' | 'straight' | 'left' | 'right' | 'slight-left' | 'slight-right' | 'u-turn' | 'roundabout' | 'arrive';
  /** Metres until the maneuver. */
  readonly distance: number;
}

interface NavigationState {
  /** Venue id or `home:<id>` the player wants to reach. */
  readonly destinationId: string | null;
  readonly destinationName: string | null;
  /** Live guidance (published by the world while navigating). */
  readonly instruction: NavigationInstruction | null;
  readonly remainingMetres: number | null;
  readonly etaSeconds: number | null;
  setDestination(id: string | null, name?: string | null): void;
  setGuidance(instruction: NavigationInstruction | null, remainingMetres: number | null, etaSeconds: number | null): void;
}

/** GPS: anyone can set a destination (phone map, HUD suggestion, life goal); the world computes and guides. */
export const useNavigation = create<NavigationState>()((set) => ({
  destinationId: null,
  destinationName: null,
  instruction: null,
  remainingMetres: null,
  etaSeconds: null,
  setDestination: (id, name = null) =>
    set({ destinationId: id, destinationName: id ? name : null, instruction: null, remainingMetres: null, etaSeconds: null }),
  setGuidance: (instruction, remainingMetres, etaSeconds) => set({ instruction, remainingMetres, etaSeconds }),
}));
