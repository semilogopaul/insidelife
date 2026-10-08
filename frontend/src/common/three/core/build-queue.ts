/**
 * Spreads expensive procedural work across animation frames: at most one job runs per frame, in FIFO order.
 * Used to build crowds of avatars without a hitch (entering a busy club builds one new look per frame instead of
 * ten in one). Jobs run outside React; their `done` callback can then set state.
 */
interface Job {
  readonly run: () => void;
  readonly done: () => void;
  cancelled: boolean;
}

const queue: Job[] = [];
let scheduled = false;

function nextFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback);
  else setTimeout(callback, 16);
}

function pump(): void {
  scheduled = false;
  let job = queue.shift();
  while (job?.cancelled) job = queue.shift();
  if (job) {
    try {
      job.run();
    } finally {
      job.done();
    }
  }
  if (queue.some((pending) => !pending.cancelled)) schedule();
  else queue.length = 0;
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  nextFrame(pump);
}

/** Queue `run` for a future frame (one job per frame); `done` follows it. Returns a cancel function. */
export function enqueueFrameJob(run: () => void, done: () => void = () => undefined): () => void {
  const job: Job = { run, done, cancelled: false };
  queue.push(job);
  schedule();
  return () => {
    job.cancelled = true;
  };
}

/** Jobs still waiting (tests / diagnostics). */
export function pendingFrameJobs(): number {
  return queue.filter((job) => !job.cancelled).length;
}
