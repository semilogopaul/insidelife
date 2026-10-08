/**
 * Dev-only User Timing around expensive procedural work (avatar builds, furniture bakes), so QA can see what a
 * frame spent where (`performance.getEntriesByName('il:avatar-build')`). No-ops in production.
 */
const enabled = process.env.NODE_ENV !== 'production' && typeof performance !== 'undefined' && typeof performance.measure === 'function';

export function timed<T>(name: string, work: () => T): T {
  if (!enabled) return work();
  const start = performance.now();
  try {
    return work();
  } finally {
    performance.measure(name, { start, end: performance.now() });
  }
}
