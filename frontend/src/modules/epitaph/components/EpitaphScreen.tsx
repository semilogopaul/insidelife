'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef } from 'react';
import { FUNERALS, formatNairaCompact, toDateParts, type LastLifeDto, type SuccessionDto } from '@insidelife/shared';
import { Button } from '@/common/components';

export interface EpitaphScreenProps {
  readonly lastLife: LastLifeDto;
  /** Dynasty history, newest first (`GET /family/legacy`). */
  readonly legacy: readonly SuccessionDto[];
  readonly onContinue: () => void;
  readonly onStartNewLife: () => void;
}

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const yearOf = (minute: number): number => toDateParts(minute).year;

/**
 * A respectful end-of-life screen in the spirit of a Lagos obituary poster: the name, the years, how they passed,
 * what they built, and who carries the family name now.
 */
export function EpitaphScreen({ lastLife, legacy, onContinue, onStartNewLife }: EpitaphScreenProps) {
  const titleId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();
  const succession = legacy.find((entry) => entry.deceased.characterId === lastLife.characterId) ?? null;
  const heir = lastLife.heirContinues ? (succession?.heir ?? null) : null;
  const heirFirstName = heir?.name.split(' ')[0] ?? null;
  const lineage = legacy.toSorted((a, b) => a.generation - b.generation);

  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, []);

  const fade = (delay: number) => (reduceMotion ? { initial: { opacity: 0 }, animate: { opacity: 1 } } : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.8, ease: 'easeOut' as const } });

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-[90] overflow-y-auto bg-[#0a1d26] text-on-ink">
      <div className="mx-auto flex min-h-full max-w-lg flex-col items-center gap-7 px-6 pb-[max(env(safe-area-inset-bottom),2rem)] pt-[max(env(safe-area-inset-top),3rem)] text-center">
        <motion.p {...fade(0)} className="text-sm font-bold text-on-ink-soft">
          Celebration of life
        </motion.p>

        <motion.div {...fade(0.2)} className="grid h-40 w-32 place-items-center rounded-[50%] bg-ink-2 ring-2 ring-danfo/70 ring-offset-4 ring-offset-[#0a1d26]">
          <span aria-hidden className="type-title text-4xl text-on-ink-soft">
            {initials(lastLife.name)}
          </span>
        </motion.div>

        <motion.div {...fade(0.4)} className="flex flex-col items-center gap-2">
          <h1 id={titleId} className="type-slogan text-balance text-[clamp(2.75rem,13vw,4.5rem)] uppercase text-on-ink">
            {lastLife.name}
          </h1>
          <p className="type-figure text-xl text-danfo">
            {yearOf(lastLife.bornAt)} – {yearOf(lastLife.diedAt)}
          </p>
          <p className="text-on-ink-soft">
            Aged {lastLife.ageAtDeath}. {lastLife.causeOfDeath ? `Passed on from ${lastLife.causeOfDeath.toLowerCase()}.` : 'Passed on peacefully.'}
          </p>
        </motion.div>

        <motion.span {...fade(0.55)} aria-hidden className="block h-[9px] w-28 danfo-stripes [--color-ink:var(--color-danfo)]" />

        <motion.dl {...fade(0.65)} className="grid w-full grid-cols-3 gap-2">
          <Plate label="Net worth" value={formatNairaCompact(lastLife.netWorth)} />
          <Plate label="Self-made" value={formatNairaCompact(lastLife.selfMadeNetWorth)} />
          <Plate label="Generation" value={String(lastLife.generation)} />
        </motion.dl>

        {succession && (
          <motion.section {...fade(0.8)} aria-label="The estate" className="w-full rounded-card bg-white/5 p-4 text-left ring-1 ring-white/10">
            <h2 className="type-title text-lg">The estate</h2>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              <EstateLine label={FUNERALS[succession.estate.funeralTier].label} value={succession.estate.funeral} />
              <EstateLine label="Probate and court fees" value={succession.estate.probate} />
              <EstateLine label={heir ? `Inherited by ${heir.name}` : 'Shared among the extended family'} value={succession.estate.inherited} strong />
            </ul>
          </motion.section>
        )}

        {lineage.length > 1 && (
          <motion.section {...fade(0.9)} aria-label="Your dynasty" className="w-full text-left">
            <h2 className="type-title text-lg">The family line</h2>
            <ol className="mt-2 flex flex-col">
              {lineage.map((entry) => (
                <li key={entry.id} className="flex gap-3 border-l-2 border-danfo/40 py-1.5 pl-3">
                  <span className="type-figure w-8 shrink-0 text-danfo">G{entry.generation}</span>
                  <span className="min-w-0 text-sm">
                    <span className="block font-bold">{entry.deceased.name}</span>
                    <span className="block text-on-ink-soft">
                      Died {yearOf(entry.deceased.diedAt)}
                      {entry.heir ? `, succeeded by ${entry.heir.name}` : ', no heir'}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </motion.section>
        )}

        <motion.div {...fade(1)} className="mt-auto flex w-full flex-col gap-2.5 pt-2">
          {heir && heirFirstName ? (
            <>
              <p className="text-sm text-on-ink-soft">
                {heir.name} {heir.agedUp ? 'has come of age and ' : ''}carries the family name now. Everything that was left is theirs to build on.
              </p>
              <Button ref={primaryRef} size="lg" block onClick={onContinue}>
                Continue as {heirFirstName}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-on-ink-soft">There was no heir to carry the name. A new life starts with a new birth lottery.</p>
              <Button ref={primaryRef} size="lg" block onClick={onStartNewLife}>
                Start a new life
              </Button>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Plate({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-chip bg-white/6 px-2.5 py-2 ring-1 ring-white/10">
      <dt className="text-2xs font-bold text-on-ink-soft">{label}</dt>
      <dd className="type-figure truncate text-lg">{value}</dd>
    </div>
  );
}

function EstateLine({ label, value, strong = false }: { readonly label: string; readonly value: number; readonly strong?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className={strong ? 'font-bold' : 'text-on-ink-soft'}>{label}</span>
      <span className={strong ? 'type-figure text-danfo' : 'tabular'}>{formatNairaCompact(value)}</span>
    </li>
  );
}
