import type { GameEventMap } from '@/common/game/game-events';
import type { PlayerSettings } from '@/common/game/ui-store';

/** Mixer buses. Everything ends in `master` → safety limiter → speakers. */
export type BusId = 'music' | 'ambience' | 'sfx' | 'ui' | 'voice';

/** The music contexts other features can request through `gameEvents.emit('music-context', …)`. */
export type MusicContext = GameEventMap['music-context']['context'];

export type CelebrationKind = GameEventMap['celebrate']['kind'];

/** The subset of player settings the audio engine listens to. */
export type AudioSettings = Pick<PlayerSettings, 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'voiceVolume' | 'voiceGuidance'>;

/** A paid track in a club's rotation (normalised from the promotions API). */
export interface ClubTrack {
  readonly trackId: string;
  readonly url: string;
  readonly artist: string;
  readonly title: string;
  readonly durationSeconds: number;
}

/** What the "Now playing" chip shows while a paid club track plays. */
export interface NowPlayingTrack {
  readonly trackId: string;
  readonly artist: string;
  readonly title: string;
  readonly venueId: string;
}

/** Debug counters for the dev audio lab (and leak checks). */
export interface AudioEngineStats {
  readonly state: AudioContextState | 'uninitialised' | 'unsupported';
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly baseLatencyMs: number;
  /** Nodes created by the engine that have not been released yet. */
  readonly liveNodes: number;
  readonly createdNodes: number;
  readonly releasedNodes: number;
  readonly musicVoices: number;
  readonly musicStyle: string | null;
  readonly musicSessions: number;
  readonly ambienceBeds: readonly string[];
  readonly samplesLoaded: number;
  readonly samplesFailed: number;
  readonly duckDb: number;
  readonly clubTrack: string | null;
}
