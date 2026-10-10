'use client';

import { motion } from 'motion/react';
import { useCallback } from 'react';
import { useSpeech, type Bubble } from '@/common/speech';
import { cn } from '@/common/utils/cn';
import { bubbleElements } from './speech-anchors';

function SpeechBubble({ bubble, labelled, clearTag }: { readonly bubble: Bubble; readonly labelled: boolean; readonly clearTag: boolean }) {
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      bubbleElements.set(bubble.characterId, element);
      return () => {
        if (bubbleElements.get(bubble.characterId) === element) bubbleElements.delete(bubble.characterId);
      };
    },
    [bubble.characterId],
  );
  return (
    // Hidden until the frame loop has placed it; it then owns the transform and opacity.
    <div ref={ref} data-speaker={bubble.handle} className={cn('absolute left-0 top-0 opacity-0 will-change-transform', clearTag && !bubble.mine && 'pb-7')}>
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 30 }}
        style={{ transformOrigin: '50% 100%' }}
        className="relative flex max-w-[13.5rem] flex-col items-center"
      >
        <p
          className={cn(
            'rounded-2xl px-3 py-1.5 text-center text-sm font-bold leading-snug break-words shadow-[var(--shadow-lift)]',
            bubble.mine ? 'bg-danfo text-ink' : 'bg-paper text-ink',
          )}
        >
          {labelled && !bubble.mine && <span className="block text-2xs font-bold text-text-soft">@{bubble.handle}</span>}
          {bubble.text}
        </p>
        <span aria-hidden className={cn('-mt-1.5 size-3 rotate-45 rounded-[2px]', bubble.mine ? 'bg-danfo' : 'bg-paper')} />
      </motion.div>
    </div>
  );
}

/**
 * Speech bubbles over the heads of people talking near you (you included), for a few seconds each. DOM over the
 * canvas, placed by `SpeechProjector`; screen readers get the words from the Nearby announcer instead. Outside,
 * other players' bubbles sit above their name tags; inside there are no tags, so the bubble names the speaker.
 */
export function SpeechBubbles({ inside }: { readonly inside: boolean }) {
  const bubbles = useSpeech((state) => state.bubbles);
  if (bubbles.length === 0) return null;
  return (
    <div aria-hidden data-testid="speech-bubbles" className="pointer-events-none absolute inset-0 overflow-hidden">
      {bubbles.map((bubble) => (
        <SpeechBubble key={bubble.lineId} bubble={bubble} labelled={inside} clearTag={!inside} />
      ))}
    </div>
  );
}
