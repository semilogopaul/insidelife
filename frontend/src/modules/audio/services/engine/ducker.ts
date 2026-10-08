/**
 * Ducking state: any number of holders (a voice line, a stinger, a paid track crossfade) each ask for a depth; the
 * deepest wins. Pure — the engine turns `depthDb` into a smoothed gain ramp on the music (and ambience) duck nodes.
 */
export type DuckReason = 'voice' | 'stinger' | 'cash';

export class DuckState {
  private readonly holds = new Map<number, { readonly reason: DuckReason; readonly depthDb: number }>();
  private nextToken = 1;

  /** Starts a duck; call the returned function to release it (idempotent). */
  hold(reason: DuckReason, depthDb: number): () => void {
    const token = this.nextToken++;
    this.holds.set(token, { reason, depthDb: Math.min(0, depthDb) });
    return () => {
      this.holds.delete(token);
    };
  }

  releaseAll(reason?: DuckReason): void {
    for (const [token, hold] of this.holds) if (!reason || hold.reason === reason) this.holds.delete(token);
  }

  /** Current attenuation (≤ 0 dB). */
  get depthDb(): number {
    let depth = 0;
    for (const hold of this.holds.values()) depth = Math.min(depth, hold.depthDb);
    return depth;
  }

  get active(): boolean {
    return this.holds.size > 0;
  }
}
