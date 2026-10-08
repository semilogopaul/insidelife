/**
 * A keyed cache with reference counting for GPU resources (geometries, textures, materials).
 *
 * `acquire` builds on first use and bumps the count; `release` decrements it and disposes once nothing uses the
 * entry any more. Disposal is deferred by a short grace period so React remounts (strict mode, quick outfit toggles)
 * don't thrash the GPU.
 */
export interface RefCountCacheOptions<V> {
  readonly create: (key: string) => V;
  readonly dispose: (value: V) => void;
  /** Milliseconds to wait before disposing an unused entry. */
  readonly graceMs?: number;
}

interface Entry<V> {
  readonly value: V;
  refs: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export class RefCountCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly options: RefCountCacheOptions<V>;

  constructor(options: RefCountCacheOptions<V>) {
    this.options = options;
  }

  acquire(key: string): V {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { value: this.options.create(key), refs: 0, timer: null };
      this.entries.set(key, entry);
    }
    if (entry.timer !== null) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    entry.refs += 1;
    return entry.value;
  }

  /**
   * Get (creating if needed) without taking a reference. Safe to call during React render: an entry nobody
   * `acquire`s within the grace period is disposed. Pair with acquire/release in an effect.
   */
  obtain(key: string): V {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { value: this.options.create(key), refs: 0, timer: null };
      this.entries.set(key, entry);
      this.scheduleEviction(key, entry);
    }
    return entry.value;
  }

  release(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs > 0 || entry.timer !== null) return;
    this.scheduleEviction(key, entry);
  }

  private scheduleEviction(key: string, entry: Entry<V>): void {
    const grace = this.options.graceMs ?? 1500;
    const evict = (): void => {
      const current = this.entries.get(key);
      if (!current || current.refs > 0) return;
      this.entries.delete(key);
      this.options.dispose(current.value);
    };
    if (grace <= 0) evict();
    else entry.timer = setTimeout(evict, grace);
  }

  /** Read without changing the reference count. */
  peek(key: string): V | undefined {
    return this.entries.get(key)?.value;
  }

  get size(): number {
    return this.entries.size;
  }

  /** Dispose everything (tests, hot reload). */
  clear(): void {
    for (const entry of this.entries.values()) {
      if (entry.timer !== null) clearTimeout(entry.timer);
      this.options.dispose(entry.value);
    }
    this.entries.clear();
  }
}
