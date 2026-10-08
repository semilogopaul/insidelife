'use client';

import { useAudioEngine } from '../hooks/use-audio-engine';
import { useAudioEvents, useSceneAudio } from '../hooks/use-game-audio';
import { NowPlayingChip } from './NowPlayingChip';

/**
 * Mounted once by the game's composition root. Owns the audio engine for the session: SFX, procedural music,
 * club rotation, Lagos ambience, the vehicle engine, celebrations and voice guidance — all driven by `gameEvents`
 * and the shared stores. Renders only the "Now playing" chip.
 */
export function AudioDirector() {
  const engine = useAudioEngine();
  useAudioEvents(engine);
  useSceneAudio(engine);
  return <NowPlayingChip />;
}
