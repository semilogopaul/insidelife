'use client';

import { useEffect, useState } from 'react';
import { Wordmark } from '@/common/components';

const LINES = [
  'Waiting for NEPA to bring light…',
  'Negotiating with the agbero…',
  'Finding change for the danfo…',
  'Warming up the generator…',
] as const;

/** Shown while the session, clock and snapshot load. Kept tiny so it paints instantly on 4G. */
export function LoadingScreen({ message }: { readonly message?: string }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIndex((value) => (value + 1) % LINES.length), 2_500);
    return () => window.clearInterval(id);
  }, []);
  const line = message ?? LINES[index];
  return (
    <div className="fixed inset-0 grid place-items-center bg-ink text-on-ink">
      <div className="flex flex-col items-center gap-6">
        <Wordmark size="lg" className="text-danfo" />
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full w-1/3 animate-[loading_1.1s_ease-in-out_infinite] rounded-full bg-danfo" />
        </div>
        <p role="status" className="text-sm text-on-ink-soft">
          {line}
        </p>
      </div>
    </div>
  );
}
