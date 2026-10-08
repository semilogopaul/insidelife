import { angleDelta, wrapAngle } from '../physics/math';

/**
 * Snapshot interpolation for other players' positions (≈4 Hz from the server). Rendering runs `delay` ms behind
 * the server clock and interpolates between the two samples around that time; when samples run out it extrapolates
 * along the last heading at the last speed for a short while, then holds. Fixed-size ring buffer, no allocations.
 */

export type RemoteMode = 'walk' | 'car';

export interface RemotePose {
  x: number;
  z: number;
  heading: number;
  speed: number;
  mode: RemoteMode;
}

export const INTERPOLATION_DELAY_MS = 150;
const MAX_EXTRAPOLATION_MS = 600;
const CAPACITY = 8;

export class InterpolationBuffer {
  private readonly t = new Float64Array(CAPACITY);
  private readonly x = new Float32Array(CAPACITY);
  private readonly z = new Float32Array(CAPACITY);
  private readonly heading = new Float32Array(CAPACITY);
  private readonly speed = new Float32Array(CAPACITY);
  private readonly mode: RemoteMode[] = new Array<RemoteMode>(CAPACITY).fill('walk');
  private head = 0;
  private size = 0;

  get count(): number {
    return this.size;
  }

  /** Server time (ms) of the newest sample, or 0. */
  get latest(): number {
    return this.size === 0 ? 0 : (this.t[(this.head - 1 + CAPACITY) % CAPACITY] as number);
  }

  /** Add a server sample (out-of-order and duplicate samples are dropped). */
  push(t: number, x: number, z: number, heading: number, speed: number, mode: RemoteMode): void {
    if (this.size > 0 && t <= this.latest) return;
    this.t[this.head] = t;
    this.x[this.head] = x;
    this.z[this.head] = z;
    this.heading[this.head] = heading;
    this.speed[this.head] = speed;
    this.mode[this.head] = mode;
    this.head = (this.head + 1) % CAPACITY;
    this.size = Math.min(CAPACITY, this.size + 1);
  }

  private index(k: number): number {
    // k = 0 is the oldest sample.
    return (this.head - this.size + k + CAPACITY * 2) % CAPACITY;
  }

  /** Pose at server time `serverNow - delay`. Returns false when there is nothing to show. */
  sample(serverNow: number, out: RemotePose, delay = INTERPOLATION_DELAY_MS): boolean {
    if (this.size === 0) return false;
    const renderAt = serverNow - delay;
    const oldest = this.index(0);
    // Before the oldest sample (hold it) or a single sample (extrapolate from it).
    if (renderAt <= (this.t[oldest] as number) || this.size === 1) return this.extrapolate(oldest, renderAt, out);
    for (let k = this.size - 1; k > 0; k--) {
      const b = this.index(k);
      const a = this.index(k - 1);
      const ta = this.t[a] as number;
      const tb = this.t[b] as number;
      if (renderAt >= ta && renderAt <= tb) {
        const f = tb > ta ? (renderAt - ta) / (tb - ta) : 1;
        out.x = (this.x[a] as number) + ((this.x[b] as number) - (this.x[a] as number)) * f;
        out.z = (this.z[a] as number) + ((this.z[b] as number) - (this.z[a] as number)) * f;
        out.heading = wrapAngle((this.heading[a] as number) + angleDelta(this.heading[a] as number, this.heading[b] as number) * f);
        out.speed = (this.speed[a] as number) + ((this.speed[b] as number) - (this.speed[a] as number)) * f;
        out.mode = this.mode[b] as RemoteMode;
        return true;
      }
    }
    return this.extrapolate(this.index(this.size - 1), renderAt, out);
  }

  private extrapolate(i: number, renderAt: number, out: RemotePose): boolean {
    const ahead = Math.max(0, Math.min(MAX_EXTRAPOLATION_MS, renderAt - (this.t[i] as number))) / 1000;
    const heading = this.heading[i] as number;
    const speed = this.speed[i] as number;
    out.x = (this.x[i] as number) + Math.cos(heading) * speed * ahead;
    out.z = (this.z[i] as number) + Math.sin(heading) * speed * ahead;
    out.heading = heading;
    out.speed = renderAt - (this.t[i] as number) > MAX_EXTRAPOLATION_MS ? 0 : speed;
    out.mode = this.mode[i] as RemoteMode;
    return true;
  }
}
