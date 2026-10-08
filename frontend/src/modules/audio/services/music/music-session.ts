import type { AudioResources } from '../engine/resources';
import { dbToGain } from '../engine/gain';
import { StepClock, STEPS_PER_BAR, secondsPerStep, type Ticker } from '../engine/scheduler';
import { MusicRig } from './instruments';
import { eventsByStep, generateBar, type BarPattern, type NoteEvent } from './patterns';
import type { MusicStyle } from './styles';

/** One style playing: a step clock on the shared ticker driving a rig. Crossfades in and out; owns no timers. */
export class MusicSession {
  readonly rig: MusicRig;
  private readonly clock: StepClock;
  private readonly stepSec: number;
  private bar = -1;
  private steps: ReadonlyArray<readonly NoteEvent[]> = [];
  private pattern: BarPattern | null = null;
  private detach: (() => void) | null = null;
  private stopping = false;
  private disposeTimer: number | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    res: AudioResources,
    private readonly ticker: Ticker,
    readonly style: MusicStyle,
    private readonly seed: string,
    destination: AudioNode,
    private trimDb: number,
  ) {
    this.rig = new MusicRig(res, style, destination);
    this.stepSec = secondsPerStep(style.bpm);
    this.clock = new StepClock({ clock: { now: () => ctx.currentTime }, secondsPerStep: this.stepSec, startTime: ctx.currentTime + 0.06 });
  }

  get currentPattern(): BarPattern | null {
    return this.pattern;
  }

  get isStopping(): boolean {
    return this.stopping;
  }

  start(fadeInSec: number): void {
    const now = this.ctx.currentTime;
    const gain = this.rig.output.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(0, now);
    gain.linearRampToValueAtTime(this.targetGain(), now + Math.max(0.02, fadeInSec));
    this.detach ??= this.ticker.add(() => this.clock.advance((step) => this.playStep(step.index, step.time)));
  }

  /** Smoothly change the session trim (e.g. club energy). */
  setTrim(trimDb: number, seconds = 1): void {
    this.trimDb = trimDb;
    if (this.stopping) return;
    const now = this.ctx.currentTime;
    this.rig.output.gain.cancelScheduledValues(now);
    this.rig.output.gain.setTargetAtTime(this.targetGain(), now, seconds / 3);
  }

  /** Fade out, stop scheduling, then release everything once the tails have rung out. */
  stop(fadeOutSec: number, onDisposed?: () => void): void {
    if (this.stopping) return;
    this.stopping = true;
    const now = this.ctx.currentTime;
    const gain = this.rig.output.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + Math.max(0.02, fadeOutSec));
    // Keep scheduling during the fade (no stutter as it leaves), stop once silent, release after the tails.
    this.disposeTimer = window.setTimeout(() => {
      this.detach?.();
      this.detach = null;
      this.disposeTimer = window.setTimeout(() => {
        this.dispose();
        onDisposed?.();
      }, 1500);
    }, fadeOutSec * 1000 + 50);
  }

  dispose(): void {
    if (this.disposeTimer !== null) window.clearTimeout(this.disposeTimer);
    this.disposeTimer = null;
    this.detach?.();
    this.detach = null;
    this.rig.dispose();
  }

  private targetGain(): number {
    return dbToGain(this.style.gainDb + this.trimDb);
  }

  private playStep(index: number, time: number): void {
    const bar = Math.floor(index / STEPS_PER_BAR);
    if (bar !== this.bar) {
      this.bar = bar;
      this.pattern = generateBar(this.style, this.seed, bar);
      this.steps = eventsByStep(this.pattern);
    }
    const step = index % STEPS_PER_BAR;
    const events = this.steps[step];
    if (!events?.length) return;
    // Shuffle: delay the off-16ths.
    const at = time + (step % 2 === 1 ? this.style.swing * this.stepSec : 0);
    for (const event of events) this.rig.play(event, at, this.stepSec);
  }
}
