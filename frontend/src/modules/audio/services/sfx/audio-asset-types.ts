/** Facts about one shipped sound, measured by `scripts/prepare-audio-assets.mjs`. */
export interface AudioAssetInfo {
  readonly durationMs: number;
  readonly channels: number;
  /** Sample peak (dBFS). */
  readonly peakDb: number;
  /** Transient-aware loudness: max(overall RMS, 50 ms RMS peak), dBFS. Used to loudness-match samples. */
  readonly loudnessDb: number;
  /** An MP3 fallback exists next to the OGG (for Safari < 18.4, which cannot decode Ogg Vorbis). */
  readonly mp3: boolean;
}
