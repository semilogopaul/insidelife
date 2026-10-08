import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueFrameJob, pendingFrameJobs } from '../core/build-queue';

describe('frame build queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('runs at most one job per frame, in order, then calls done', () => {
    const log: string[] = [];
    for (const name of ['a', 'b', 'c']) enqueueFrameJob(() => log.push(`run ${name}`), () => log.push(`done ${name}`));
    expect(log).toEqual([]);
    vi.advanceTimersByTime(16);
    expect(log).toEqual(['run a', 'done a']);
    vi.advanceTimersByTime(16);
    expect(log).toEqual(['run a', 'done a', 'run b', 'done b']);
    vi.advanceTimersByTime(16);
    expect(pendingFrameJobs()).toBe(0);
    expect(log.at(-1)).toBe('done c');
  });

  it('skips cancelled jobs without spending a frame on them', () => {
    const log: string[] = [];
    const cancel = enqueueFrameJob(() => log.push('x'));
    enqueueFrameJob(() => log.push('y'));
    cancel();
    vi.advanceTimersByTime(16);
    expect(log).toEqual(['y']);
  });
});
