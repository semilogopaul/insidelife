'use client';

import { create } from 'zustand';

/**
 * Client view state of flying. Where you are is the server's (aboard your plane your location is `aircraft:<id>`; boarding
 * and stepping out are `useAircraftBoarding` calls). This store mirrors it so the cabin responds at once:
 * - which of your planes you are sitting in at the General Aviation Terminal. Set when you walk up to it on the apron
 *   (before the server has answered: `syncing`), then kept in line with the server's location by `useAviationScene`;
 *   cleared when you step out of the door or the plane takes off. `returnToAirside` opens the terminal on the apron
 *   after you step out.
 * - the flight whose sky sequence you skipped (or that has finished playing): for the rest of that flight you stay in
 *   the cabin. `watching` brings the sky back.
 */
interface AboardState {
  readonly aircraftId: string | null;
  /** A boarding or stepping-out request is on its way: the mirror is the truth until the server answers. */
  readonly syncing: boolean;
  readonly returnToAirside: boolean;
  /** `flightKey` of the flight whose sky sequence is over. */
  readonly skippedFlight: string | null;
  /** The plane you chose to stand on your stand when you have several here. */
  readonly chosenId: string | null;
  board(aircraftId: string): void;
  /** Step out of the plane (back onto the apron). */
  deplane(): void;
  /** The request is over (or failed): the server's location is the truth again. */
  settled(): void;
  /** Follow the server's location (no request in flight). */
  follow(aircraftId: string | null): void;
  /** The terminal has been put back on the apron: forget the request. */
  arrivedAirside(): void;
  skipFlight(key: string): void;
  watchFlight(): void;
  choose(aircraftId: string): void;
  /** Forget the boarding (the plane took off, or you left the terminal another way). */
  reset(): void;
}

export const useAboard = create<AboardState>()((set) => ({
  aircraftId: null,
  syncing: false,
  returnToAirside: false,
  skippedFlight: null,
  chosenId: null,
  board: (aircraftId) => set({ aircraftId, returnToAirside: false, syncing: true }),
  deplane: () => set({ aircraftId: null, returnToAirside: true, syncing: true }),
  settled: () => set({ syncing: false }),
  follow: (aircraftId) => set({ aircraftId }),
  arrivedAirside: () => set({ returnToAirside: false }),
  skipFlight: (key) => set({ skippedFlight: key }),
  watchFlight: () => set({ skippedFlight: null }),
  choose: (aircraftId) => set({ chosenId: aircraftId }),
  reset: () => set({ aircraftId: null, returnToAirside: false, syncing: false }),
}));
