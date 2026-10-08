'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useNowPlaying } from '../stores/now-playing-store';

/** Three bars that bounce while a track plays (static under reduced motion via MotionConfig). */
function Equalizer() {
  return (
    <span aria-hidden className="flex h-3.5 items-end gap-[2px]">
      {[0.55, 1, 0.75].map((peak, index) => (
        <motion.span
          key={index}
          className="w-[3px] origin-bottom rounded-full bg-ink"
          style={{ height: '100%' }}
          initial={{ scaleY: peak * 0.6 }}
          animate={{ scaleY: [peak * 0.35, peak, peak * 0.5, peak * 0.9] }}
          transition={{ duration: 0.9 + index * 0.17, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

/**
 * "Now playing: Artist — Title" while a player-paid track plays in a club. Top-centre, below the HUD's top row on
 * phones; informational only (doesn't intercept taps on the world).
 */
export function NowPlayingChip() {
  const track = useNowPlaying((state) => state.track);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[max(5.25rem,calc(env(safe-area-inset-top)+4.5rem))] z-30 flex justify-center px-4 md:top-[max(0.75rem,env(safe-area-inset-top))]">
      <div role="status" aria-live="polite" aria-atomic="true">
        <AnimatePresence>
          {track && (
            <motion.div
              key={track.trackId}
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="glass flex max-w-[min(26rem,calc(100vw-2rem))] items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-on-ink"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-danfo">
                <Equalizer />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-2xs font-bold uppercase tracking-[0.12em] text-danfo">Now playing</span>
                <span className="block truncate text-sm font-semibold">
                  {track.artist}
                  <span className="text-on-ink-soft"> — {track.title}</span>
                </span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
