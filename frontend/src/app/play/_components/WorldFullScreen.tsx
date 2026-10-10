'use client';

import { Wordmark } from '@/common/components';

/** Shown instead of the game while the server is at its players-online cap; the socket retries by itself. */
export function WorldFullScreen() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink p-6 text-center text-on-ink">
      <div className="flex max-w-sm flex-col items-center gap-5">
        <Wordmark size="lg" className="text-danfo" />
        <h1 className="type-title text-2xl">Lagos is full right now</h1>
        <p role="status" className="text-on-ink-soft">
          We’ll get you in automatically.
        </p>
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full w-1/3 animate-[loading_1.1s_ease-in-out_infinite] rounded-full bg-danfo" />
        </div>
        <p className="text-sm text-on-ink-soft">Keep this page open.</p>
      </div>
    </div>
  );
}
