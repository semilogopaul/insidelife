import type { AudioResources } from '../engine/resources';
import type { ClubTrack, NowPlayingTrack } from '../../types/audio';
import { PLAY_REPORT_AFTER_SEC } from './club-rotation';

/**
 * Interleaves player-paid tracks with the club's procedural groove: groove for a while → crossfade into the next
 * paid track (HTMLAudioElement → MediaElementSource → music bus, so settings and ducking apply) → back to the groove.
 * The file is only requested when its turn comes (no prefetching of multi-MB tracks).
 */

export interface ClubDjDeps {
  readonly ctx: AudioContext;
  readonly res: AudioResources;
  /** Music bus input. */
  readonly output: AudioNode;
  readonly fetchRotation: (venueId: string, signal: AbortSignal) => Promise<ClubTrack[]>;
  readonly reportPlay: (trackId: string, venueId: string) => void;
  readonly onNowPlaying: (track: NowPlayingTrack | null) => void;
  /** Fade the procedural groove out (false) while a paid track plays, back in (true) after. */
  readonly setGrooveActive: (active: boolean) => void;
  readonly random: () => number;
  /** Linear volume for the un-routed fallback element (cross-origin media without CORS). */
  readonly fallbackVolume: () => number;
}

type DjState = 'idle' | 'groove' | 'loading' | 'playing' | 'ending';

interface ActiveTrack {
  readonly track: ClubTrack;
  readonly venueId: string;
  readonly element: HTMLAudioElement;
  readonly routed: boolean;
  readonly listeners: AbortController;
  reported: boolean;
}

const FIRST_GROOVE_SEC: readonly [number, number] = [18, 35];
const GROOVE_SEC: readonly [number, number] = [80, 150];
const LOAD_TIMEOUT_MS = 12_000;
const FADE_IN_SEC = 1.6;
const FADE_OUT_SEC = 1.2;

export class ClubDj {
  private venueId: string | null = null;
  private tracks: ClubTrack[] = [];
  private nextIndex = 0;
  private state: DjState = 'idle';
  private timer: number | null = null;
  private fetchAbort: AbortController | null = null;
  private routedPlayer: { readonly element: HTMLAudioElement; readonly source: MediaElementAudioSourceNode; readonly gain: GainNode } | null = null;
  private active: ActiveTrack | null = null;
  private paused = false;

  constructor(private readonly deps: ClubDjDeps) {}

  get nowPlaying(): ClubTrack | null {
    return this.state === 'playing' ? (this.active?.track ?? null) : null;
  }

  get currentVenue(): string | null {
    return this.venueId;
  }

  enter(venueId: string): void {
    if (this.venueId === venueId) return;
    this.leave();
    this.venueId = venueId;
    this.state = 'groove';
    const abort = new AbortController();
    this.fetchAbort = abort;
    void this.deps.fetchRotation(venueId, abort.signal).then((tracks) => {
      if (abort.signal.aborted || this.venueId !== venueId) return;
      this.tracks = tracks;
      if (!tracks.length) return;
      // Start somewhere random in the rotation so artists share first slots fairly.
      this.nextIndex = Math.floor(this.deps.random() * tracks.length);
      this.scheduleNext(FIRST_GROOVE_SEC);
    });
  }

  /** Dev/test hook: play a specific track now (skips the rotation fetch). */
  playNow(venueId: string, track: ClubTrack): void {
    if (this.venueId !== venueId) {
      this.leave();
      this.venueId = venueId;
    }
    this.tracks = [track];
    this.nextIndex = 0;
    this.clearTimer();
    this.stopActive(0.3);
    this.startTrack();
  }

  leave(): void {
    this.fetchAbort?.abort();
    this.fetchAbort = null;
    this.clearTimer();
    const wasPlaying = this.state === 'playing' || this.state === 'loading' || this.state === 'ending';
    this.stopActive(0.6);
    this.venueId = null;
    this.tracks = [];
    this.state = 'idle';
    if (wasPlaying) this.deps.setGrooveActive(true);
  }

  /** Tab hidden: pause the element and timers. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.clearTimer();
    this.active?.element.pause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.state === 'playing' && this.active) {
      void this.active.element.play().catch(() => this.finishTrack());
    } else if (this.state === 'groove' && this.tracks.length) {
      this.scheduleNext([20, 45]);
    }
  }

  /** Keeps the un-routed fallback element in step with the settings. */
  syncFallbackVolume(): void {
    if (this.active && !this.active.routed) this.active.element.volume = this.deps.fallbackVolume();
  }

  dispose(): void {
    this.leave();
    if (this.routedPlayer) {
      this.deps.res.release(this.routedPlayer.source, this.routedPlayer.gain);
      this.routedPlayer.element.removeAttribute('src');
      this.routedPlayer.element.load();
      this.routedPlayer = null;
    }
  }

  // ----- internals ---------------------------------------------------------------------------------------------

  private scheduleNext([min, max]: readonly [number, number]): void {
    this.clearTimer();
    if (this.paused || !this.tracks.length) return;
    this.state = 'groove';
    const seconds = min + this.deps.random() * (max - min);
    this.timer = window.setTimeout(() => this.startTrack(), seconds * 1000);
  }

  private clearTimer(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private ensureRoutedPlayer(): NonNullable<ClubDj['routedPlayer']> {
    if (!this.routedPlayer) {
      const element = new Audio();
      element.crossOrigin = 'anonymous';
      element.preload = 'none';
      const source = this.deps.res.track(this.deps.ctx.createMediaElementSource(element));
      const gain = this.deps.res.gain(0);
      source.connect(gain).connect(this.deps.output);
      this.routedPlayer = { element, source, gain };
    }
    return this.routedPlayer;
  }

  private startTrack(attemptFallback = false): void {
    const venueId = this.venueId;
    if (!venueId || !this.tracks.length || this.paused) return;
    const track = this.tracks[this.nextIndex % this.tracks.length];
    if (!track) return;
    if (!attemptFallback) this.nextIndex += 1;
    this.state = 'loading';

    const routed = !attemptFallback;
    const element = routed ? this.ensureRoutedPlayer().element : new Audio();
    const listeners = new AbortController();
    const active: ActiveTrack = { track, venueId, element, routed, listeners, reported: false };
    this.active = active;
    const opts = { signal: listeners.signal };

    const loadTimeout = window.setTimeout(() => fail(), LOAD_TIMEOUT_MS);
    const fail = (): void => {
      window.clearTimeout(loadTimeout);
      if (this.active !== active) return;
      const crossOrigin = new URL(track.url, window.location.href).origin !== window.location.origin;
      this.detachActive();
      // Cross-origin media without CORS headers can't be routed through Web Audio: retry as a plain element once.
      if (routed && crossOrigin && this.state === 'loading') this.startTrack(true);
      else this.afterTrack();
    };

    element.addEventListener('error', fail, opts);
    element.addEventListener(
      'canplay',
      () => {
        window.clearTimeout(loadTimeout);
        if (this.active !== active || this.state !== 'loading') return;
        if (!routed) element.volume = this.deps.fallbackVolume();
        element.play().then(
          () => this.onStarted(active),
          () => fail(),
        );
      },
      { ...opts, once: true },
    );
    element.addEventListener('ended', () => this.finishTrack(), opts);
    element.addEventListener(
      'timeupdate',
      () => {
        if (!active.reported && element.currentTime >= PLAY_REPORT_AFTER_SEC) {
          active.reported = true;
          this.deps.reportPlay(track.trackId, venueId);
        }
      },
      opts,
    );
    element.preload = 'auto';
    element.src = track.url;
    element.load();
  }

  private onStarted(active: ActiveTrack): void {
    if (this.active !== active) return;
    this.state = 'playing';
    if (active.routed && this.routedPlayer) {
      const gain = this.routedPlayer.gain.gain;
      const now = this.deps.ctx.currentTime;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(0, now);
      gain.linearRampToValueAtTime(1, now + FADE_IN_SEC);
    }
    this.deps.setGrooveActive(false);
    this.deps.onNowPlaying({ trackId: active.track.trackId, artist: active.track.artist, title: active.track.title, venueId: active.venueId });
    // Safety net if `ended` never fires (stalled stream): the declared duration plus slack.
    const maxMs = Math.min(active.track.durationSeconds + 10, 610) * 1000;
    this.clearTimer();
    this.timer = window.setTimeout(() => this.finishTrack(), maxMs);
  }

  private finishTrack(): void {
    if (this.state !== 'playing' && this.state !== 'loading') return;
    this.clearTimer();
    this.state = 'ending';
    this.stopActive(FADE_OUT_SEC);
    this.afterTrack();
  }

  private afterTrack(): void {
    this.deps.onNowPlaying(null);
    this.deps.setGrooveActive(true);
    if (this.venueId) this.scheduleNext(GROOVE_SEC);
    else this.state = 'idle';
  }

  /** Fade the current element out and release its media resource. */
  private stopActive(fadeSec: number): void {
    const active = this.active;
    if (!active) return;
    this.deps.onNowPlaying(null);
    if (active.routed && this.routedPlayer) {
      const gain = this.routedPlayer.gain.gain;
      const now = this.deps.ctx.currentTime;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(0, now + fadeSec);
    }
    active.listeners.abort();
    this.active = null;
    // Routed elements fade on the gain node first; the plain fallback element can't ramp, so it stops at once.
    window.setTimeout(
      () => {
        if (this.active?.element === active.element) return; // re-used for a newer track already
        active.element.pause();
        active.element.removeAttribute('src');
        active.element.load();
      },
      active.routed ? fadeSec * 1000 + 50 : 0,
    );
  }

  private detachActive(): void {
    const active = this.active;
    if (!active) return;
    active.listeners.abort();
    active.element.pause();
    active.element.removeAttribute('src');
    active.element.load();
    this.active = null;
  }
}
