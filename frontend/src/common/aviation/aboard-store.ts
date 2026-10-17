'use client';

import { create } from 'zustand';

/**
 * Client view state of flying (the server only knows where you are and whether you're travelling):
 * - which of your planes you are sitting in at the General Aviation Terminal. Set when you walk up to it on the apron;
 *   cleared when you step out of the door or the plane takes off. `returnToAirside` opens the terminal on the apron
 *   after you step out.
 * - the flight whose sky sequence you skipped (or that has finished playing): for the rest of that flight you stay in
 *   the cabin. `watching` brings the sky back.
 */
interface AboardState {
  readonly aircraftId: string | null;
  readonly returnToAirside: boolean;
  /** `flightKey` of the flight whose sky sequence is over. */
  readonly skippedFlight: string | null;
  /** The plane you chose to stand on your stand when you have several here. */
  readonly chosenId: string | null;
  board(aircraftId: string): void;
  /** Step out of the plane (back onto the apron). */
  deplane(): void;
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
  returnToAirside: false,
  skippedFlight: null,
  chosenId: null,
  board: (aircraftId) => set({ aircraftId, returnToAirside: false }),
  deplane: () => set({ aircraftId: null, returnToAirside: true }),
  arrivedAirside: () => set({ returnToAirside: false }),
  skipFlight: (key) => set({ skippedFlight: key }),
  watchFlight: () => set({ skippedFlight: null }),
  choose: (aircraftId) => set({ chosenId: aircraftId }),
  reset: () => set({ aircraftId: null, returnToAirside: false }),
}));
