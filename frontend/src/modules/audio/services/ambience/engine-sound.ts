import type { AudioResources } from '../engine/resources';
import { dbToGain } from '../engine/gain';

/** Simple 5-speed box: rpm climbs through each gear and drops at the shift. Pure (exported for tests). */
const GEAR_TOP_KMH: readonly number[] = [18, 38, 62, 92, 130, 220];
const IDLE_RPM = 850;
const SHIFT_LOW_RPM = 1900;
const SHIFT_HIGH_RPM = 5200;

export function engineRpm(speedKmh: number): number {
  const speed = Math.max(0, speedKmh);
  if (speed < 1) return IDLE_RPM;
  let floor = 0;
  for (const [gear, top] of GEAR_TOP_KMH.entries()) {
    if (speed <= top || gear === GEAR_TOP_KMH.length - 1) {
      const progress = Math.min(1, (speed - floor) / (top - floor));
      const low = gear === 0 ? IDLE_RPM + 300 : SHIFT_LOW_RPM;
      return low + progress * (SHIFT_HIGH_RPM - low);
    }
    floor = top;
  }
  return IDLE_RPM;
}

export type EngineMode = 'driving' | 'riding';

/**
 * Looping car engine whose pitch follows the speedometer (sampled ~10 Hz, smoothed on the audio thread) plus
 * road/tyre noise. "Riding" (danfo/Bolt passenger) is the same engine, muffled by the cabin.
 */
export class EngineSound {
  private readonly level: GainNode;
  private readonly fire: OscillatorNode;
  private readonly sub: OscillatorNode;
  private readonly tone: BiquadFilterNode;
  private readonly road: AudioBufferSourceNode;
  private readonly roadFilter: BiquadFilterNode;
  private readonly roadLevel: GainNode;
  private readonly nodes: AudioNode[];
  private stopped = false;
  private mode: EngineMode;

  constructor(
    private readonly res: AudioResources,
    output: AudioNode,
    mode: EngineMode,
    random: () => number,
  ) {
    this.mode = mode;
    const now = res.ctx.currentTime;
    this.level = res.gain(0);
    this.fire = res.osc('sawtooth', IDLE_RPM / 30);
    this.sub = res.osc('square', IDLE_RPM / 60);
    const subGain = res.gain(0.4);
    const shaper = res.shaper(2.4);
    this.tone = res.filter('lowpass', 420, 1.6);
    const mix = res.gain(0.7);
    this.road = res.source(res.brownNoise(), true);
    this.roadFilter = res.filter('lowpass', 200, 0.7);
    this.roadLevel = res.gain(0);
    this.fire.connect(shaper);
    this.sub.connect(subGain).connect(shaper);
    shaper.connect(this.tone).connect(mix).connect(this.level);
    this.road.connect(this.roadFilter).connect(this.roadLevel).connect(this.level);
    this.level.connect(output);
    this.nodes = [subGain, shaper, this.tone, mix, this.roadFilter, this.roadLevel, this.level];
    this.fire.start(now);
    this.sub.start(now);
    this.road.start(now, random() * 3);
    this.level.gain.setTargetAtTime(dbToGain(this.baseDb()), now, 0.15);
  }

  setMode(mode: EngineMode): void {
    this.mode = mode;
  }

  /** Called ~10 Hz; parameters glide on the audio thread so steps are inaudible. */
  setSpeed(speedKmh: number): void {
    if (this.stopped) return;
    const now = this.res.ctx.currentTime;
    const rpm = engineRpm(speedKmh);
    const load = Math.min(1, speedKmh / 120);
    const cabin = this.mode === 'riding';
    this.fire.frequency.setTargetAtTime(rpm / 30, now, 0.12);
    this.sub.frequency.setTargetAtTime(rpm / 60, now, 0.12);
    this.tone.frequency.setTargetAtTime(Math.min(cabin ? 650 : 2400, 260 + rpm * 0.28), now, 0.15);
    this.roadFilter.frequency.setTargetAtTime(180 + speedKmh * 7, now, 0.3);
    this.roadLevel.gain.setTargetAtTime(Math.min(1.4, load * 1.6), now, 0.3);
    this.level.gain.setTargetAtTime(dbToGain(this.baseDb() + load * 4), now, 0.2);
  }

  stop(fadeSec = 0.5): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.res.ctx.currentTime;
    this.level.gain.cancelScheduledValues(now);
    this.level.gain.setTargetAtTime(0, now, fadeSec / 4);
    const end = now + fadeSec + 0.1;
    this.fire.onended = () => this.res.release(this.fire, this.sub, this.road, ...this.nodes);
    this.fire.stop(end);
    this.sub.stop(end);
    this.road.stop(end);
  }

  private baseDb(): number {
    return this.mode === 'riding' ? -22 : -15;
  }
}
