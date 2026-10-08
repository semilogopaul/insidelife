import { createRng } from '@insidelife/shared';
import type { SfxId } from '@/common/game/game-events';
import type { AudioEngineStats, AudioSettings, BusId, CelebrationKind, ClubTrack, NowPlayingTrack } from '../../types/audio';
import { AmbienceMixer } from '../ambience/ambience-mixer';
import { SILENT_AMBIENCE, type AmbienceTargets } from '../ambience/ambience-state';
import { EngineSound, type EngineMode } from '../ambience/engine-sound';
import { fetchClubRotation, reportClubPlay } from '../club/club-rotation';
import { MusicDirector, type MusicRequest } from '../music/music-director';
import { SampleBank } from '../sfx/sample-bank';
import { CORE_SAMPLES, SFX_RECIPES, STINGERS, recipeSamples, type SfxBus, type SfxRecipe } from '../sfx/sfx-catalog';
import { SfxPlayer } from '../sfx/sfx-player';
import { VoiceGuide } from '../voice/voice-guide';
import { busLevelsFor, isMusicAudible, isSfxAudible, speechVolumeFor } from './bus-levels';
import { DuckState, type DuckReason } from './ducker';
import { dbToGain } from './gain';
import { AudioResources } from './resources';
import { Ticker, browserIntervalTimer } from './scheduler';

/**
 * The game's audio engine (one per page, created lazily). Owns the single AudioContext and the mixer:
 *
 *   music ─► musicDuck ─┐
 *   ambience ─► ambDuck ┤
 *   sfx ────────────────┼─► master ─► limiter ─► speakers
 *   ui ─────────────────┤
 *   voice ──────────────┘          (speechSynthesis can't be routed; its volume is applied per utterance)
 *
 * Features never call this directly — `AudioDirector` binds it to `gameEvents` and the shared stores.
 */

const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;
const BUS_IDS: readonly BusId[] = ['music', 'ambience', 'sfx', 'ui', 'voice'];
const LEVEL_TAU = 0.03;
const DUCK_ATTACK_TAU = 0.04;
const DUCK_RELEASE_TAU = 0.3;

interface Graph {
  readonly ctx: AudioContext;
  readonly res: AudioResources;
  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly buses: Readonly<Record<BusId, GainNode>>;
  readonly musicDuck: GainNode;
  readonly ambienceDuck: GainNode;
  readonly bank: SampleBank;
  readonly sfx: SfxPlayer;
  readonly music: MusicDirector;
  readonly ambience: AmbienceMixer;
}

export interface AudioEngineCallbacks {
  onNowPlaying(track: NowPlayingTrack | null): void;
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const legacy = (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
}

function saveDataRequested(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

function randomSeed(): string {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(36)).join('');
}

export class AudioEngine {
  private graph: Graph | null = null;
  private readonly ticker = new Ticker(browserIntervalTimer);
  private readonly duckState = new DuckState();
  private readonly random: () => number;
  private readonly seed: string;
  private readonly voice: VoiceGuide;
  private settings: AudioSettings | null = null;
  private musicRequest: MusicRequest | null = null;
  private ambienceTargets: AmbienceTargets = SILENT_AMBIENCE;
  private indoors = false;
  private vehicle: { mode: EngineMode; speedKmh: number } | null = null;
  private engineSound: EngineSound | null = null;
  private attached = 0;
  private unlockArmed = false;
  private hidden = false;
  private ambienceTickDetach: (() => void) | null = null;
  private idlePreloadDone = false;
  private callbacks: AudioEngineCallbacks | null = null;
  private readonly unsupported: boolean;

  constructor() {
    this.seed = randomSeed();
    this.random = createRng(this.seed).next;
    this.unsupported = audioContextCtor() === null;
    const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.voice = new VoiceGuide(
      synth,
      () => this.holdDuck('voice', -9),
      () => !this.hidden && this.attached > 0,
    );
  }

  // ----- lifecycle -----------------------------------------------------------------------------------------------

  /** Called by `AudioDirector` on mount. Returns the detach function. */
  attach(callbacks: AudioEngineCallbacks): () => void {
    this.attached += 1;
    this.callbacks = callbacks;
    if (this.attached === 1) {
      document.addEventListener('visibilitychange', this.onVisibility);
      this.hidden = document.visibilityState === 'hidden';
      const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
      // Sticky activation (the player already clicked through sign-in): the context may start right away.
      if (activation?.hasBeenActive) this.ensureGraph();
      if (!this.graph || this.graph.ctx.state !== 'running') this.armUnlock();
      this.applyAll();
    }
    return () => this.detach();
  }

  private detach(): void {
    this.attached = Math.max(0, this.attached - 1);
    if (this.attached > 0) return;
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.disarmUnlock();
    this.voice.cancel();
    this.callbacks?.onNowPlaying(null);
    this.callbacks = null;
    // Keep the context (re-creating needs a new gesture) but stop everything that makes sound or schedules.
    this.musicRequest = null;
    this.ambienceTargets = SILENT_AMBIENCE;
    this.vehicle = null;
    this.applyAll();
  }

  get stats(): AudioEngineStats {
    const graph = this.graph;
    return {
      state: this.unsupported ? 'unsupported' : graph ? graph.ctx.state : 'uninitialised',
      currentTime: graph?.ctx.currentTime ?? 0,
      sampleRate: graph?.ctx.sampleRate ?? 0,
      baseLatencyMs: Math.round((graph?.ctx.baseLatency ?? 0) * 1000),
      liveNodes: graph?.res.live ?? 0,
      createdNodes: graph?.res.created ?? 0,
      releasedNodes: graph?.res.released ?? 0,
      musicVoices: graph?.music.voices ?? 0,
      musicStyle: graph?.music.styleId ?? null,
      musicSessions: graph?.music.sessions ?? 0,
      ambienceBeds: graph?.ambience.activeBeds ?? [],
      samplesLoaded: graph?.bank.loaded ?? 0,
      samplesFailed: graph?.bank.failures ?? 0,
      duckDb: this.duckState.depthDb,
      clubTrack: graph?.music.dj.nowPlaying ? `${graph.music.dj.nowPlaying.artist} — ${graph.music.dj.nowPlaying.title}` : null,
    };
  }

  // ----- inputs --------------------------------------------------------------------------------------------------

  setSettings(settings: AudioSettings): void {
    this.settings = settings;
    this.voice.setVolume(speechVolumeFor(settings));
    this.applyLevels();
    this.applyMusic();
    this.applyAmbience();
  }

  setMusic(request: MusicRequest | null): void {
    this.musicRequest = request;
    this.applyMusic();
  }

  setAmbience(targets: AmbienceTargets, indoors: boolean): void {
    this.indoors = indoors;
    // The scene is re-derived every second; only touch the graph when something actually changed.
    if (sameTargets(targets, this.ambienceTargets)) return;
    this.ambienceTargets = targets;
    this.applyAmbience();
  }

  /** Vehicle engine loop: `null` when on foot/inside. Call ~10 Hz while driving. */
  setVehicle(mode: EngineMode | null, speedKmh: number): void {
    this.vehicle = mode ? { mode, speedKmh } : null;
    this.applyVehicle();
  }

  playSfx(id: SfxId, volume = 1): boolean {
    const recipe: SfxRecipe | undefined = SFX_RECIPES[id];
    return recipe ? this.playRecipe(id, recipe, volume) : false;
  }

  celebrate(kind: CelebrationKind): boolean {
    return this.playRecipe(`celebrate:${kind}`, STINGERS[kind], 1);
  }

  speak(text: string): boolean {
    return this.voice.say(text, { interrupt: true });
  }

  /** Dev/test hook: play a club track immediately through the music bus. */
  debugPlayClubTrack(venueId: string, track: ClubTrack): void {
    this.graph?.music.dj.playNow(venueId, track);
  }

  // ----- graph ---------------------------------------------------------------------------------------------------

  private ensureGraph(): Graph | null {
    if (this.graph || this.unsupported) return this.graph;
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    const res = new AudioResources(ctx);
    const limiter = res.track(ctx.createDynamicsCompressor());
    limiter.threshold.value = -4;
    limiter.knee.value = 2;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.18;
    limiter.connect(ctx.destination);
    const master = res.gain(0);
    master.connect(limiter);
    const musicDuck = res.gain(1);
    const ambienceDuck = res.gain(1);
    musicDuck.connect(master);
    ambienceDuck.connect(master);
    const buses = {} as Record<BusId, GainNode>;
    for (const id of BUS_IDS) {
      const bus = res.gain(0);
      bus.connect(id === 'music' ? musicDuck : id === 'ambience' ? ambienceDuck : master);
      buses[id] = bus;
    }
    const outputs: Readonly<Record<SfxBus, GainNode>> = { ui: buses.ui, sfx: buses.sfx };
    const bank = new SampleBank(outputs, ctx);
    const music = new MusicDirector(
      ctx,
      res,
      this.ticker,
      buses.music,
      this.seed,
      {
        fetchRotation: fetchClubRotation,
        reportPlay: reportClubPlay,
        onNowPlaying: (track) => this.callbacks?.onNowPlaying(track),
        random: this.random,
        fallbackVolume: () => {
          if (!this.settings) return 0.3;
          const levels = busLevelsFor(this.settings);
          return levels.master.gain * levels.music.gain;
        },
      },
      !saveDataRequested(),
    );
    const sfx = new SfxPlayer({
      ctx,
      res,
      bank,
      outputs,
      random: this.random,
      duck: (depthDb, holdMs) => window.setTimeout(this.holdDuck('stinger', depthDb), holdMs),
      speak: (line) => this.voice.say(line, { interrupt: false, rate: 1.12, pitch: 0.85, volumeScale: 0.55 }),
      indoors: () => this.indoors,
      musicRoot: () => music.currentChordRoot,
    });
    const ambience = new AmbienceMixer(res, buses.ambience, this.random);
    ctx.addEventListener('statechange', this.onContextState);
    this.graph = { ctx, res, master, limiter, buses, musicDuck, ambienceDuck, bank, sfx, music, ambience };
    this.applyAll();
    if (ctx.state === 'running') this.onRunning();
    return this.graph;
  }

  private applyAll(): void {
    this.applyLevels();
    this.applyMusic();
    this.applyAmbience();
    this.applyVehicle();
  }

  private applyLevels(): void {
    const graph = this.graph;
    if (!graph || !this.settings) return;
    const levels = busLevelsFor(this.settings);
    const now = graph.ctx.currentTime;
    graph.master.gain.setTargetAtTime(levels.master.gain, now, LEVEL_TAU);
    for (const id of BUS_IDS) graph.buses[id].gain.setTargetAtTime(levels[id].gain, now, LEVEL_TAU);
    graph.music.dj.syncFallbackVolume();
  }

  private applyMusic(): void {
    const graph = this.graph;
    if (!graph) return;
    const enabled = this.attached > 0 && !!this.settings && isMusicAudible(this.settings) && this.musicRequest !== null;
    graph.music.setRequest(this.musicRequest);
    graph.music.setEnabled(enabled);
  }

  private applyAmbience(): void {
    const graph = this.graph;
    if (!graph) return;
    const audible = this.attached > 0 && !!this.settings && isSfxAudible(this.settings);
    const targets = audible ? this.ambienceTargets : SILENT_AMBIENCE;
    graph.ambience.setTargets(targets);
    const needsTick = targets.hornsPerMinute > 0 || targets.kekesPerMinute > 0 || targets.thunderPerMinute > 0 || targets.frogsPerMinute > 0;
    if (needsTick && !this.ambienceTickDetach) this.ambienceTickDetach = this.ticker.add(() => graph.ambience.tick());
    else if (!needsTick && this.ambienceTickDetach) {
      this.ambienceTickDetach();
      this.ambienceTickDetach = null;
    }
  }

  private applyVehicle(): void {
    const graph = this.graph;
    const audible = this.attached > 0 && !!this.settings && isSfxAudible(this.settings) && graph?.ctx.state === 'running';
    if (!graph || !this.vehicle || !audible) {
      this.engineSound?.stop();
      this.engineSound = null;
      return;
    }
    this.engineSound ??= new EngineSound(graph.res, graph.buses.sfx, this.vehicle.mode, this.random);
    this.engineSound.setMode(this.vehicle.mode);
    this.engineSound.setSpeed(this.vehicle.speedKmh);
  }

  private playRecipe(key: string, recipe: SfxRecipe, volume: number): boolean {
    const graph = this.graph;
    if (!graph || this.hidden || this.attached === 0 || !this.settings) return false;
    return graph.sfx.play(key, recipe, volume);
  }

  // ----- ducking -------------------------------------------------------------------------------------------------

  /** Starts a duck now; the returned function releases it (idempotent). */
  private holdDuck(reason: DuckReason, depthDb: number): () => void {
    const release = this.duckState.hold(reason, depthDb);
    this.applyDuck();
    return () => {
      release();
      this.applyDuck();
    };
  }

  private applyDuck(): void {
    const graph = this.graph;
    if (!graph) return;
    const depth = this.duckState.depthDb;
    const now = graph.ctx.currentTime;
    const deeper = dbToGain(depth) < graph.musicDuck.gain.value;
    const tau = deeper ? DUCK_ATTACK_TAU : DUCK_RELEASE_TAU;
    graph.musicDuck.gain.setTargetAtTime(dbToGain(depth), now, tau);
    // Ambience dips less: the world shouldn't vanish under a stinger.
    graph.ambienceDuck.gain.setTargetAtTime(dbToGain(depth * 0.5), now, tau);
  }

  // ----- unlock / visibility -------------------------------------------------------------------------------------

  private armUnlock(): void {
    if (this.unlockArmed || this.unsupported) return;
    this.unlockArmed = true;
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, this.onGesture, { capture: true, passive: true });
  }

  private disarmUnlock(): void {
    if (!this.unlockArmed) return;
    this.unlockArmed = false;
    for (const type of UNLOCK_EVENTS) window.removeEventListener(type, this.onGesture, { capture: true });
  }

  /** Runs inside a user gesture: create/resume the context (iOS needs both in the same handler) and prime it. */
  private readonly onGesture = (): void => {
    if (this.hidden) return;
    const graph = this.ensureGraph();
    if (!graph) return;
    const { ctx } = graph;
    if (ctx.state !== 'running') {
      void ctx.resume().then(
        () => this.onRunning(),
        () => undefined,
      );
      // Legacy iOS unlock: start a one-sample silent buffer inside the gesture.
      try {
        const silent = ctx.createBufferSource();
        silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        silent.connect(ctx.destination);
        silent.onended = () => silent.disconnect();
        silent.start(0);
      } catch {
        // Ignore: best effort.
      }
    } else {
      this.onRunning();
    }
  };

  private onRunning(): void {
    const graph = this.graph;
    if (!graph || graph.ctx.state !== 'running') return;
    this.disarmUnlock();
    graph.bank.preload(CORE_SAMPLES);
    this.applyAll();
    this.scheduleIdlePreload();
  }

  private scheduleIdlePreload(): void {
    if (this.idlePreloadDone) return;
    this.idlePreloadDone = true;
    // Respect data saver: everything else loads on first use instead.
    if (saveDataRequested()) return;
    const run = (): void => {
      const graph = this.graph;
      if (!graph) return;
      const all = recipeSamples([...Object.values(SFX_RECIPES), ...Object.values(STINGERS)]);
      graph.bank.preload(all);
    };
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 4000 });
    else globalThis.setTimeout(run, 1500);
  }

  private readonly onContextState = (): void => {
    const graph = this.graph;
    if (!graph) return;
    const state = graph.ctx.state as AudioContextState | 'interrupted';
    if (state === 'running') {
      this.onRunning();
    } else if (!this.hidden && this.attached > 0 && state !== 'closed') {
      // iOS interruption (call, Siri) or an autoplay re-lock: wait for the next gesture.
      this.armUnlock();
    }
  };

  private readonly onVisibility = (): void => {
    const graph = this.graph;
    this.hidden = document.visibilityState === 'hidden';
    if (this.hidden) {
      this.voice.cancel();
      this.ticker.pause();
      graph?.music.pause();
      this.engineSound?.stop(0.1);
      this.engineSound = null;
      if (graph && graph.ctx.state === 'running') void graph.ctx.suspend().catch(() => undefined);
      return;
    }
    this.ticker.resume();
    graph?.music.resume();
    if (graph && graph.ctx.state !== 'running') {
      void graph.ctx.resume().then(
        () => this.onRunning(),
        () => this.armUnlock(),
      );
      // Some browsers (iOS) refuse a resume without a gesture: arm the unlock in case the promise never settles.
      window.setTimeout(() => {
        if (this.graph && this.graph.ctx.state !== 'running' && !this.hidden) this.armUnlock();
      }, 300);
    }
    this.applyVehicle();
  };
}

function sameTargets(a: AmbienceTargets, b: AmbienceTargets): boolean {
  for (const key of Object.keys(a) as Array<keyof AmbienceTargets>) if (a[key] !== b[key]) return false;
  return true;
}

let instance: AudioEngine | null = null;

/** The page-wide engine. Client only; constructing it doesn't touch audio hardware until a gesture. */
export function getAudioEngine(): AudioEngine {
  if (!instance) {
    const engine = new AudioEngine();
    instance = engine;
    // Dev builds: `window.__insideLifeAudio()` returns live engine stats (used by the audio lab and e2e checks).
    if (process.env.NODE_ENV !== 'production') {
      (window as Window & { __insideLifeAudio?: () => AudioEngineStats }).__insideLifeAudio = () => engine.stats;
    }
  }
  return instance;
}
