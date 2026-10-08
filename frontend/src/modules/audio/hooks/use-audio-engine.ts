'use client';

import { useEffect, useState } from 'react';
import { useUi } from '@/common/game/ui-store';
import { getAudioEngine, type AudioEngine } from '../services/engine/audio-engine';
import { useNowPlaying } from '../stores/now-playing-store';
import type { AudioSettings } from '../types/audio';

const pickSettings = (settings: AudioSettings): AudioSettings => ({
  masterVolume: settings.masterVolume,
  musicVolume: settings.musicVolume,
  sfxVolume: settings.sfxVolume,
  voiceVolume: settings.voiceVolume,
  voiceGuidance: settings.voiceGuidance,
});

/**
 * Attaches the page-wide engine for the lifetime of the calling component and keeps it in sync with the player's
 * audio settings (live: moving a slider is heard immediately). Null during server rendering. Constructing the engine
 * touches no audio hardware; the AudioContext is created on the first user gesture.
 */
export function useAudioEngine(): AudioEngine | null {
  const [engine] = useState<AudioEngine | null>(() => (typeof window === 'undefined' ? null : getAudioEngine()));

  useEffect(() => {
    if (!engine) return;
    const detach = engine.attach({ onNowPlaying: (track) => useNowPlaying.getState().setTrack(track) });
    engine.setSettings(pickSettings(useUi.getState().settings));
    const unsubscribe = useUi.subscribe((state, previous) => {
      if (state.settings !== previous.settings) engine.setSettings(pickSettings(state.settings));
    });
    return () => {
      unsubscribe();
      detach();
    };
  }, [engine]);

  return engine;
}
