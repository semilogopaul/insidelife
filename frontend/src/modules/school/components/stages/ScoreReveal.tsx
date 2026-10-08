'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { JAMB_MAX_SCORE, type ExamRegistrationDto } from '@insidelife/shared';
import { Button } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { cn } from '@/common/utils/cn';
import { useScoreReveal } from '../../hooks/use-score-reveal';
import { jambVerdict } from '../../services/school-rules';

const COUNT_MS = 2_200;

const VERDICT = {
  university: { line: 'You can apply to universities.', tone: 'text-danfo' },
  polytechnic: { line: 'Polytechnics will take this. Universities want 150+.', tone: 'text-on-ink' },
  retake: {
    line: 'Below the 100 minimum. Read more and rewrite — plenty people pass on the second try.',
    tone: 'text-okada',
  },
} as const;

/** The JAMB result moment: a sealed card, then the score counts up like the CBT screen loading. Plays once. */
export function ScoreReveal({ exam }: { readonly exam: ExamRegistrationDto }) {
  const score = exam.score ?? 0;
  const { revealed, markRevealed } = useScoreReveal(exam.id);
  const [phase, setPhase] = useState<'sealed' | 'counting' | 'done'>(revealed ? 'done' : 'sealed');
  const [shown, setShown] = useState(revealed ? score : 0);
  const reduceMotion = useReducedMotion();
  const frame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const finish = (): void => {
    setShown(score);
    setPhase('done');
    markRevealed();
    const verdict = jambVerdict(score);
    if (verdict === 'university') {
      gameEvents.emit('celebrate', {
        kind: 'milestone',
        title: `JAMB ${score}!`,
        body: 'Admission dey call your name.',
      });
      gameEvents.emit('sfx', { id: 'celebration' });
    } else {
      gameEvents.emit('sfx', { id: verdict === 'retake' ? 'ui-error' : 'notification' });
    }
  };

  const open = (): void => {
    if (reduceMotion) return finish();
    setPhase('counting');
    gameEvents.emit('sfx', { id: 'ui-open' });
    const started = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - started) / COUNT_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(score * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else finish();
    };
    frame.current = requestAnimationFrame(tick);
  };

  const verdict = VERDICT[jambVerdict(score)];
  return (
    <section
      aria-label="JAMB result"
      className="relative overflow-hidden rounded-card bg-ink px-4 pb-5 pt-4 text-on-ink"
    >
      <p className="text-xs font-bold text-on-ink-soft">JAMB UTME result</p>
      {phase === 'sealed' ? (
        <>
          <h3 className="type-slogan mt-1 text-[2.4rem] text-danfo">Your result is out</h3>
          <p className="mt-2 text-sm text-on-ink-soft">Breathe. Whatever it says, there’s a way forward.</p>
          <Button size="lg" className="mt-4" onClick={open}>
            Check my score
          </Button>
        </>
      ) : (
        <>
          <p className="mt-2 flex items-baseline gap-2" aria-live="polite" aria-atomic>
            <span
              className={cn(
                'type-figure text-[4.5rem] leading-none',
                phase === 'done' ? verdict.tone : 'text-on-ink',
              )}
            >
              {shown}
            </span>
            <span className="type-figure text-xl text-on-ink-soft">/ {JAMB_MAX_SCORE}</span>
          </p>
          <div aria-hidden className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-danfo"
              style={{ width: `${(shown / JAMB_MAX_SCORE) * 100}%` }}
            />
          </div>
          {phase === 'done' && <p className="mt-3 text-sm font-bold">{verdict.line}</p>}
        </>
      )}
      <span
        aria-hidden
        className="danfo-stripes absolute inset-x-0 bottom-0 block h-[9px] [--color-ink:var(--color-danfo)]"
      />
    </section>
  );
}
