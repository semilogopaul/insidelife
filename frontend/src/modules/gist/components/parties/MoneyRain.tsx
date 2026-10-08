'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { formatNaira, type SprayEventDto } from '@insidelife/shared';
import { useRealtimeEvent } from '@/common/realtime/use-realtime';

interface Shower {
  readonly key: number;
  readonly spray: SprayEventDto;
}

let seq = 0;

/** Live money rain for a party: falling notes and a caption whenever anyone sprays (`party:spray`). */
export function MoneyRain({ venueId, onSpray }: { readonly venueId: string; readonly onSpray?: (spray: SprayEventDto) => void }) {
  const [showers, setShowers] = useState<readonly Shower[]>([]);
  const reduceMotion = useReducedMotion();

  useRealtimeEvent('party:spray', (spray) => {
    if (spray.venueId !== venueId) return;
    seq += 1;
    setShowers((current) => [...current.slice(-2), { key: seq, spray }]);
    onSpray?.(spray);
  });

  useEffect(() => {
    if (showers.length === 0) return;
    const id = window.setTimeout(() => setShowers((current) => current.slice(1)), 2_600);
    return () => window.clearTimeout(id);
  }, [showers]);

  const latest = showers.at(-1);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <span aria-hidden className="absolute inset-0">
      {!reduceMotion &&
        showers.map((shower) =>
          Array.from({ length: Math.min(14, 4 + Math.round(shower.spray.amount / 5_000)) }, (_, index) => (
            <motion.span
              key={`${shower.key}-${index}`}
              className="absolute top-0 h-4 w-8 rounded-[3px] shadow-sm"
              style={{ left: `${(index * 37 + shower.key * 13) % 92}%`, background: index % 3 === 0 ? '#0f8a4f' : '#2f6f9f' }}
              initial={{ y: -30, rotate: (index % 2 ? 1 : -1) * 20, opacity: 1 }}
              animate={{ y: 420, rotate: (index % 2 ? -1 : 1) * 160, opacity: 0.2 }}
              transition={{ duration: 1.6 + (index % 4) * 0.25, delay: (index % 5) * 0.08, ease: 'easeIn' }}
            />
          )),
        )}
      </span>
      <AnimatePresence>
        {latest && (
          <motion.p
            key={latest.key}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="status"
            className="absolute inset-x-4 top-2 mx-auto w-fit rounded-full bg-ink/90 px-3 py-1.5 text-center text-sm font-bold text-on-ink"
          >
            @{latest.spray.fromHandle} sprayed @{latest.spray.toHandle} <span className="text-danfo">{formatNaira(latest.spray.amount)}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
