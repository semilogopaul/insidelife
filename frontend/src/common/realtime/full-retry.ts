/**
 * "Lagos is full": when the server is at its players-online cap it sends `world:full` and closes the socket. The
 * client waits a jittered 20-40 s (so a waiting crowd doesn't come back in lockstep) and reconnects by itself, until it
 * is placed in the world.
 */

export const FULL_RETRY_MIN_MS = 20_000;
export const FULL_RETRY_MAX_MS = 40_000;

/** How long to wait before the next try (uniform in 20-40 s). `random` returns [0, 1). */
export function fullRetryDelayMs(random: () => number = Math.random): number {
  return Math.round(FULL_RETRY_MIN_MS + random() * (FULL_RETRY_MAX_MS - FULL_RETRY_MIN_MS));
}

export interface FullRetry {
  /** The server said it is full: show the waiting state and schedule the next try. */
  onFull(): void;
  /** The server placed us in the world: drop the waiting state. */
  onPlaced(): void;
  /** The game no longer wants a connection. */
  cancel(): void;
}

export function createFullRetry(options: {
  readonly connect: () => void;
  readonly setFull: (full: boolean) => void;
  readonly random?: () => number;
}): FullRetry {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    onFull() {
      options.setFull(true);
      clear();
      timer = setTimeout(() => {
        timer = null;
        options.connect();
      }, fullRetryDelayMs(options.random));
    },
    onPlaced() {
      clear();
      options.setFull(false);
    },
    cancel() {
      clear();
      options.setFull(false);
    },
  };
}
