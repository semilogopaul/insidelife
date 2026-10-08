'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Phone apps. Each app is rendered by the phone feature; others only open them by id. */
export const PHONE_APPS = [
  'home',
  'map',
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
  'promote',
  'goals',
  'me',
] as const;
export type PhoneApp = (typeof PHONE_APPS)[number];

export type GraphicsQuality = 'auto' | 'low' | 'high';

export interface PlayerSettings {
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
  readonly voiceVolume: number;
  readonly voiceGuidance: boolean;
  readonly graphics: GraphicsQuality;
  readonly showFps: boolean;
  readonly invertSteering: boolean;
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
};

interface UiState {
  readonly phoneOpen: boolean;
  readonly phoneApp: PhoneApp;
  /** Deep link payload for the opened app (e.g. a job id, a venue id). */
  readonly phoneParam: string | null;
  readonly settings: PlayerSettings;
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
    },
  ),
);
