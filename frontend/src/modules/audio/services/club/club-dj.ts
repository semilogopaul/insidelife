import type { AudioResources } from '../engine/resources';
import type { ClubTrack, NowPlayingTrack, ScheduledClubTrack } from '../../types/audio';
import { nextPlayAfter, playAt, type ClubSchedule } from './club-rotation';

/**
 * Plays a club's paid songs exactly on the server's schedule (`GET /promotions/club-schedule`): each song starts at its
 * published time (server clock) and plays in full; walking in mid-song joins it where it is, like a real sound system.
 * Between songs, and when nothing is booked, the club's procedural game music plays. The file is only fetched shortly
 * before its turn (no prefetching of multi-MB tracks). Played through the music bus (HTMLAudioElement →
 * MediaElementSource), so volume settings and ducking apply.
 */

export interface ClubDjDeps {
  readonly ctx: AudioContext;
  readonly res: AudioResources;
  /** Music bus input. */
  readonly output: AudioNode;
  readonly fetchSchedule: (venueId: string, signal: AbortSignal) => Promise<ClubSchedule | null>;
  /** Server-corrected wall clock (ms): the schedule's clock. */
  readonly serverNow: () => number;
  readonly onNowPlaying: (track: NowPlayingTrack | null) => void;
  /** Fade the procedural groove out (false) while a paid track plays, back in (true) after. */
  readonly setGrooveActive: (active: boolean) => void;
  /** Linear volume for the un-routed fallback element (cross-origin media without CORS). */
  readonly fallbackVolume: () => number;
}

type DjState = 'idle' | 'groove' | 'loading' | 'playing';

interface ActiveTrack {
  readonly play: ScheduledClubTrack;
  readonly venueId: string;
  readonly element: HTMLAudioElement;
  readonly routed: boolean;
  readonly listeners: AbortController;
}

/** Start fetching a song this long before its slot, so it starts on time. */
const PRELOAD_MS = 8_000;
const LOAD_TIMEOUT_MS = 15_000;
/** Ask for the schedule again at least this often (new approvals, take-downs), and well before it runs out. */
const REFRESH_MS = 3 * 60_000;
const RETRY_MS = 30_000;
const FADE_IN_SEC = 1.2;
const FADE_OUT_SEC = 1.2;
/** Seek again if the element has drifted this far from the schedule (tab throttling, a slow start). */
const DRIFT_SEC = 1.5;

export class ClubDj {
  private venueId: string | null = null;
  private plays: readonly ScheduledClubTrack[] = [];
  private state: DjState = 'idle';
  private timer: number | null = null;
  private refreshTimer: number | null = null;
  private fetchAbort: AbortController | null = null;
  private routedPlayer: { readonly element: HTMLAudioElement; readonly source: MediaElementAudioSourceNode; readonly gain: GainNode } | null = null;
  private active: ActiveTrack | null = null;
  private paused = false;
  private doneSlots = new Set<number>();

  constructor(private readonly deps: ClubDjDeps) {}

  get nowPlaying(): ClubTrack | null {
    return this.state === 'playing' ? (this.active?.play ?? null) : null;
  }

  get currentVenue(): string | null {
    return this.venueId;
  }

  /** The schedule the DJ is following (for tests and the dev audio lab). */
  get schedule(): readonly ScheduledClubTrack[] {
    return this.plays;
  }

  enter(venueId: string): void {
    if (this.venueId === venueId) return;
    this.leave();
    this.venueId = venueId;
    this.state = 'groove';
    this.load();
  }

  /** Dev/test hook: play a specific track now, as if the schedule said so. */
  playNow(venueId: string, track: ClubTrack): void {
    if (this.venueId !== venueId) {
      this.leave();
      this.venueId = venueId;
    }
    this.clearTimers();
    this.stopActive(0.3);
    this.plays = [{ ...track, slotIndex: -1, startsAtMs: this.deps.serverNow() }];
    this.plan();
  }

  leave(): void {
    this.fetchAbort?.abort();
    this.fetchAbort = null;
    this.clearTimers();
    const wasPlaying = this.active !== null;
    this.stopActive(0.6);
    this.venueId = null;
    this.plays = [];
    this.doneSlots = new Set();
    this.state = 'idle';
    if (wasPlaying) this.deps.setGrooveActive(true);
  }

  /** Tab hidden: pause the element and timers. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.clearTimers();
    this.active?.element.pause();
  }

  /** Tab visible again: back in step with the schedule (the song may have moved on, or ended, meanwhile). */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.venueId) this.load();
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

  // ----- schedule ----------------------------------------------------------------------------------------------

  private load(): void {
    const venueId = this.venueId;
    if (!venueId) return;
    this.fetchAbort?.abort();
    const abort = new AbortController();
    this.fetchAbort = abort;
    void this.deps.fetchSchedule(venueId, abort.signal).then((schedule) => {
      if (abort.signal.aborted || this.venueId !== venueId) return;
      if (schedule) {
        this.plays = schedule.plays;
        // A song taken off the schedule (moderation) stops; everything else carries on.
        if (this.active && this.active.play.slotIndex >= 0 && !schedule.plays.some((play) => play.slotIndex === this.active?.play.slotIndex)) this.finishTrack();
      }
      const now = this.deps.serverNow();
      const refreshIn = schedule ? Math.max(5_000, Math.min(REFRESH_MS, schedule.untilMs - now - 60_000)) : RETRY_MS;
      this.scheduleRefresh(refreshIn);
      this.plan();
    });
  }

  private scheduleRefresh(ms: number): void {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      if (!this.paused) this.load();
    }, ms);
  }

  /** Line up with the schedule: join the song that should be playing now, or wait for the next one. */
  private plan(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    if (this.paused || !this.venueId) return;
    const now = this.deps.serverNow();
    if (this.active) {
      this.keepInStep(now);
      return;
    }
    const current = playAt(this.plays, now);
    if (current && !this.doneSlots.has(current.slotIndex)) {
      this.startTrack(current);
      return;
    }
    const next = nextPlayAfter(this.plays, now);
    if (!next) return;
    this.timer = window.setTimeout(() => this.startTrack(next), Math.max(0, next.startsAtMs - now - PRELOAD_MS));
  }

  /** While a song plays: correct drift; end it when its time is up. */
  private keepInStep(now: number): void {
    const active = this.active;
    if (!active) return;
    const endsAt = active.play.startsAtMs + active.play.durationSeconds * 1000;
    if (now >= endsAt) {
      this.finishTrack();
      return;
    }
    if (this.state === 'playing') {
      const should = (now - active.play.startsAtMs) / 1000;
      if (Math.abs(active.element.currentTime - should) > DRIFT_SEC) active.element.currentTime = should;
      if (active.element.paused) void active.element.play().catch(() => this.finishTrack());
    }
    this.timer = window.setTimeout(() => this.finishTrack(), endsAt - now + 500);
  }

  // ----- playback ----------------------------------------------------------------------------------------------

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

  private startTrack(play: ScheduledClubTrack, attemptFallback = false): void {
    const venueId = this.venueId;
    if (!venueId || this.paused) return;
    this.clearTimer();
    this.state = 'loading';
    const routed = !attemptFallback;
    const element = routed ? this.ensureRoutedPlayer().element : new Audio();
    const listeners = new AbortController();
    const active: ActiveTrack = { play, venueId, element, routed, listeners };
    this.active = active;
    const opts = { signal: listeners.signal };

    const loadTimeout = window.setTimeout(() => fail(), LOAD_TIMEOUT_MS);
    const fail = (): void => {
      window.clearTimeout(loadTimeout);
      if (this.active !== active) return;
      const crossOrigin = new URL(play.url, window.location.href).origin !== window.location.origin;
      this.detachActive();
      // Cross-origin media without CORS headers can't be routed through Web Audio: retry as a plain element once.
      if (routed && crossOrigin) this.startTrack(play, true);
      else {
        this.doneSlots.add(play.slotIndex);
        this.afterTrack();
      }
    };

    element.addEventListener('error', fail, opts);
    element.addEventListener(
      'canplay',
      () => {
        window.clearTimeout(loadTimeout);
        if (this.active !== active || this.state !== 'loading') return;
        const wait = play.startsAtMs - this.deps.serverNow();
        // Loaded early: wait for the slot. Loaded late (or walked in mid-song): join where it is.
        window.setTimeout(() => this.beginPlayback(active, fail), Math.max(0, wait));
      },
      { ...opts, once: true },
    );
    element.addEventListener('ended', () => this.finishTrack(), opts);
    element.preload = 'auto';
    element.src = play.url;
    element.load();
  }

  private beginPlayback(active: ActiveTrack, fail: () => void): void {
    if (this.active !== active || this.paused) return;
    const { element, play, routed } = active;
    const offset = (this.deps.serverNow() - play.startsAtMs) / 1000;
    if (offset >= play.durationSeconds - 1) {
      this.finishTrack();
      return;
    }
    if (offset > 0.25) element.currentTime = offset;
    if (!routed) element.volume = this.deps.fallbackVolume();
    element.play().then(
      () => this.onStarted(active),
      () => fail(),
    );
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
    this.deps.onNowPlaying({ trackId: active.play.trackId, artist: active.play.artist, title: active.play.title, venueId: active.venueId });
    this.keepInStep(this.deps.serverNow());
  }

  private finishTrack(): void {
    if (!this.active) return;
    // Never restart a slot that has played (a file a little shorter than its declared length ends early).
    this.doneSlots.add(this.active.play.slotIndex);
    this.clearTimer();
    this.stopActive(FADE_OUT_SEC);
    this.afterTrack();
  }

  private afterTrack(): void {
    this.deps.onNowPlaying(null);
    this.deps.setGrooveActive(true);
    this.state = this.venueId ? 'groove' : 'idle';
    this.plan();
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

  private clearTimer(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private clearTimers(): void {
    this.clearTimer();
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }
}
