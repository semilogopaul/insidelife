'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Phone apps. Each app is rendered by the phone feature; others only open them by id. */
export const PHONE_APPS = [
  'home',
  'map',
  'messages',
  'bank',
  'jobs',
  'school',
  'homes',
  'shop',
  'motors',
  'health',
  'family',
  'invest',
  'gist',
  'fobes',
  'betting',
  'promote',
  'goals',
  'me',
] as const;
export type PhoneApp = (typeof PHONE_APPS)[number];

export type GraphicsQuality = 'auto' | 'low' | 'high';

/** Which thumb walks on touch screens: the move stick's half of the screen (the other half looks around). */
export type StickSide = 'right' | 'left';

export interface PlayerSettings {
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly voiceVolume: number;
  readonly voiceGuidance: boolean;
  readonly graphics: GraphicsQuality;
  readonly showFps: boolean;
  readonly invertSteering: boolean;
  /** Touch: the walking stick (and the steering arrows) on this side; the other thumb looks around (and drives the pedals). */
  readonly walkStick: StickSide;
  /**
   * Clean screen: the HUD is hidden for an unobstructed view (a small Show button brings it back; H on a keyboard).
   * Movement controls, name tags, speech bubbles, toasts and alerts still show.
   */
  readonly hudHidden: boolean;
}

const DEFAULT_SETTINGS: PlayerSettings = {
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.8,
  voiceVolume: 0.9,
  voiceGuidance: true,
  graphics: 'auto',
  showFps: false,
  invertSteering: false,
  walkStick: 'left',
  hudHidden: false,
};

interface UiState {
  readonly phoneOpen: boolean;
  readonly phoneApp: PhoneApp;
  /** Deep link payload for the opened app (e.g. a job id, a venue id). */
  readonly phoneParam: string | null;
  readonly settings: PlayerSettings;
  /** Bumped by "Replay the walkthrough" (Me → Settings); the walkthrough feature starts when it changes. Never persisted. */
  readonly tourRequest: number;
  /** The place's "Things to do here" sheet is pulled up (the HUD clears the bottom of a phone for it). Never persisted. */
  readonly placeSheetOpen: boolean;
  setPlaceSheetOpen(open: boolean): void;
  requestTour(): void;
  openPhone(app?: PhoneApp, param?: string | null): void;
  closePhone(): void;
  updateSettings(patch: Partial<PlayerSettings>): void;
}

/** Client-only UI state shared across features. Settings persist per device (a convenience, never game state). */
export const useUi = create<UiState>()(
  persist(
    (set) => ({
      phoneOpen: false,
      phoneApp: 'home',
      phoneParam: null,
      settings: DEFAULT_SETTINGS,
      tourRequest: 0,
      placeSheetOpen: false,
      setPlaceSheetOpen: (open) => set((state) => (state.placeSheetOpen === open ? state : { placeSheetOpen: open })),
      requestTour: () => set((state) => ({ tourRequest: state.tourRequest + 1, phoneOpen: false })),
      openPhone: (app = 'home', param = null) => set({ phoneOpen: true, phoneApp: app, phoneParam: param }),
      closePhone: () => set({ phoneOpen: false }),
      updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
    }),
    {
      name: 'insidelife:ui',
      storage: createJSONStorage(() => {
        try {
          return window.localStorage;
        } catch {
          return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
        }
      }),
      partialize: (state) => ({ settings: state.settings }),
      // Settings saved by an older version miss newer fields: fill them with the defaults.
      merge: (persisted, current) => {
        const saved = (persisted as { settings?: Partial<PlayerSettings> } | undefined)?.settings;
        return { ...current, settings: { ...DEFAULT_SETTINGS, ...saved } };
      },
    },
  ),
);
