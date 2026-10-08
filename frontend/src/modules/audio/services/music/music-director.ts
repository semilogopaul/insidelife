import type { AudioResources } from '../engine/resources';
import type { Ticker } from '../engine/scheduler';
import { ClubDj, type ClubDjDeps } from '../club/club-dj';
import type { MusicContext } from '../../types/audio';
import { MusicSession } from './music-session';
import { MUSIC_STYLES, styleForContext, type MusicStyleId } from './styles';

export interface MusicRequest {
  readonly context: MusicContext;
  readonly night: boolean;
  /** 0-1 (a bar is calmer than a club). */
  readonly energy: number;
  /** Club/bar venue whose paid rotation should be interleaved. */
  readonly clubVenueId: string | null;
}

const CROSSFADE_SEC = 2.5;
const STOP_FADE_SEC = 1.2;

/**
 * Decides what plays: maps the scene to a style, crossfades between sessions, and hands the floor to the club DJ
 * while a paid track plays. When music is disabled (volume 0) nothing is scheduled at all.
 */
export class MusicDirector {
  readonly dj: ClubDj;
  private current: MusicSession | null = null;
  private readonly retiring = new Set<MusicSession>();
  private request: MusicRequest | null = null;
  private enabled = false;
  private grooveActive = true;
  private sessionCounter = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly res: AudioResources,
    private readonly ticker: Ticker,
    private readonly output: AudioNode,
    private readonly baseSeed: string,
    djDeps: Omit<ClubDjDeps, 'ctx' | 'res' | 'output' | 'setGrooveActive'>,
    private readonly allowClubTracks: boolean,
  ) {
    this.dj = new ClubDj({
      ...djDeps,
      ctx,
      res,
      output,
      setGrooveActive: (active) => {
        if (this.grooveActive === active) return;
        this.grooveActive = active;
        this.apply();
      },
    });
  }

  get styleId(): MusicStyleId | null {
    return this.current?.style.id ?? null;
  }

  get sessions(): number {
    return (this.current ? 1 : 0) + this.retiring.size;
  }

  get voices(): number {
    let total = this.current?.rig.voices ?? 0;
    for (const session of this.retiring) total += session.rig.voices;
    return total;
  }

  /** The chord currently playing (for in-key stingers). */
  get currentChordRoot(): number | null {
    return this.current?.currentPattern?.chord.root ?? null;
  }

  setRequest(request: MusicRequest | null): void {
    const previous = this.request;
    this.request = request;
    if (
      previous &&
      request &&
      previous.context === request.context &&
      previous.night === request.night &&
      previous.energy === request.energy &&
      previous.clubVenueId === request.clubVenueId
    ) {
      return;
    }
    this.apply();
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.apply();
  }

  /** Tab hidden/visible. Step clocks resync on their own (they skip what they missed). */
  pause(): void {
    this.dj.pause();
  }

  resume(): void {
    this.dj.resume();
  }

  dispose(): void {
    this.dj.dispose();
    this.current?.dispose();
    this.current = null;
    for (const session of this.retiring) session.dispose();
    this.retiring.clear();
  }

  private apply(): void {
    const request = this.request;
    const choice = request && this.enabled ? styleForContext(request.context, request.night, request.energy) : null;

    if (this.enabled && this.allowClubTracks && request?.clubVenueId) this.dj.enter(request.clubVenueId);
    else this.dj.leave();

    const wanted = choice && this.grooveActive ? choice.styleId : null;
    if (wanted && this.current?.style.id === wanted && !this.current.isStopping) {
      this.current.setTrim(choice?.trimDb ?? 0);
      return;
    }
    if (this.current) this.retire(this.current, wanted ? CROSSFADE_SEC : STOP_FADE_SEC);
    this.current = null;
    if (!wanted) return;
    this.sessionCounter += 1;
    const session = new MusicSession(
      this.ctx,
      this.res,
      this.ticker,
      MUSIC_STYLES[wanted],
      `${this.baseSeed}:${this.sessionCounter}`,
      this.output,
      choice?.trimDb ?? 0,
    );
    session.start(CROSSFADE_SEC);
    this.current = session;
  }

  private retire(session: MusicSession, fadeSec: number): void {
    this.retiring.add(session);
    session.stop(fadeSec, () => this.retiring.delete(session));
  }
}
