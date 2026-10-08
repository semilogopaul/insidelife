'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Minus, Plus, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { formatNaira, type PartyDetailDto, type PlayerCardDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { toast } from '@/common/components';
import { gameEvents } from '@/common/game/game-events';
import { newIdempotencyKey } from '@/common/utils/money-input';
import { cn } from '@/common/utils/cn';
import { useSpray } from '../../hooks/use-parties';
import { SPRAY_PRESETS, addNotes, bundleAmount, bundleFor, efccWarning, validateSpray, type NoteBundle } from '../../services/spray';
import { PlayerAvatar } from '../PlayerAvatar';

const NOTE_STYLE = {
  1_000: { bg: 'bg-[#2f6f9f]', label: '₦1,000' },
  500: { bg: 'bg-naira', label: '₦500' },
} as const;

export interface SprayPanelProps {
  readonly party: PartyDetailDto;
  readonly me: { readonly id: string; readonly handle: string };
  /** Cash in hand (sprays come out of your cash). */
  readonly cash: number;
}

/**
 * Make it rain: pick who's dancing, build a wad of ₦1,000 / ₦500 notes and hit the big button. Every tap is one
 * spray (with its own idempotency key). Warns before you cross EFCC's ₦500k naira-abuse line.
 */
export function SprayPanel({ party, me, cash }: SprayPanelProps) {
  const recipients: readonly PlayerCardDto[] = [party.host, ...party.guests].filter((player, index, all) => player.id !== me.id && all.findIndex((other) => other.id === player.id) === index);
  const [picked, setToHandle] = useState<string | null>(null);
  // Default to the first person dancing (guests can arrive after the panel opens).
  const toHandle = recipients.some((player) => player.handle === picked) ? picked : (recipients[0]?.handle ?? null);
  const [bundle, setBundle] = useState<NoteBundle>(bundleFor(5_000));
  const [myTotal, setMyTotal] = useState<number>(() => party.topSprayers.find((entry) => entry.player.id === me.id)?.amount ?? 0);
  const [bursts, setBursts] = useState(0);
  const spray = useSpray(party.id);
  const reduceMotion = useReducedMotion();

  const amount = bundleAmount(bundle);
  const check = validateSpray(amount, cash, myTotal);
  const warning = check.ok ? efccWarning(myTotal, amount) : null;
  const target = recipients.find((player) => player.handle === toHandle) ?? null;

  if (recipients.length === 0) {
    return <p className="rounded-card bg-paper-2 p-3 text-sm text-text-soft">Nobody else is here to spray yet. Wait for the dance floor to fill up.</p>;
  }

  const fire = (): void => {
    if (!target || !check.ok) return;
    gameEvents.emit('sfx', { id: 'spray' });
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(25);
    setBursts((value) => value + 1);
    spray.mutate(
      { toHandle: target.handle, amount, idempotencyKey: newIdempotencyKey() },
      {
        onSuccess: (result) => {
          setMyTotal(result.yourPartyTotal);
          if (result.cloutGained > 0) toast({ title: `+${result.cloutGained} clout`, body: 'The MC just hailed you.', tone: 'good' });
          // EFCC fines arrive as a server notification (toasted by the game root); just make it sting.
          if (result.nairaAbuse) gameEvents.emit('sfx', { id: 'ui-error' });
        },
        onError: (error) => {
          gameEvents.emit('sfx', { id: 'ui-error' });
          toast({ title: 'The notes didn’t land', body: errorMessage(error), tone: 'bad' });
        },
      },
    );
  };

  return (
    <section aria-label="Spray money" className="flex flex-col gap-3 rounded-card bg-ink p-3.5 text-on-ink">
      <div>
        <p className="text-xs font-bold text-on-ink-soft">Who’s dancing?</p>
        <ul className="-mx-1 mt-1.5 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Spray who">
          {recipients.map((player) => {
            const selected = player.handle === toHandle;
            return (
              <li key={player.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setToHandle(player.handle)}
                  className={cn('flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-bold', selected ? 'bg-danfo text-ink' : 'bg-white/8 text-on-ink hover:bg-white/12')}
                >
                  <PlayerAvatar name={`${player.firstName} ${player.lastName}`} handle={player.handle} size="sm" />
                  {player.firstName}
                  {player.id === party.host.id && <span className="text-2xs opacity-70">host</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NoteCounter note={1_000} count={bundle.thousands} onChange={(delta) => setBundle((current) => addNotes(current, 1_000, delta))} />
        <NoteCounter note={500} count={bundle.fiveHundreds} onChange={(delta) => setBundle((current) => addNotes(current, 500, delta))} />
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick wads">
        {SPRAY_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={amount === preset}
            onClick={() => setBundle(bundleFor(preset))}
            className={cn('h-9 rounded-chip px-3 text-sm font-bold', amount === preset ? 'bg-on-ink text-ink' : 'bg-white/8 hover:bg-white/12')}
          >
            {formatNaira(preset)}
          </button>
        ))}
      </div>

      {!check.ok && amount > 0 && <p className="text-sm font-bold text-[#ff9f8f]">{check.message}</p>}
      {warning && (
        <p className="flex gap-2 rounded-chip bg-okada/20 p-2.5 text-sm text-[#ffd3cb]" role="alert">
          <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-okada" />
          {warning}
        </p>
      )}

      <div className="relative">
        <AnimatePresence>
          {!reduceMotion &&
            bursts > 0 &&
            Array.from({ length: 8 }, (_, index) => (
              <motion.span
                key={`${bursts}-${index}`}
                aria-hidden
                className={cn('pointer-events-none absolute left-1/2 top-2 z-10 h-5 w-10 rounded-[3px]', index % 3 === 0 ? 'bg-naira' : 'bg-[#2f6f9f]')}
                initial={{ x: '-50%', y: 0, rotate: 0, opacity: 1 }}
                animate={{ x: `${-50 + (index - 3.5) * 70}%`, y: -110 - (index % 3) * 30, rotate: (index - 3.5) * 25, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            ))}
        </AnimatePresence>
        <motion.button
          type="button"
          whileTap={reduceMotion ? undefined : { scale: 0.95 }}
          disabled={!check.ok || !target}
          onClick={fire}
          className="relative flex h-20 w-full flex-col items-center justify-center rounded-[22px] bg-danfo text-ink shadow-[0_6px_0_var(--color-danfo-deep)] active:translate-y-1 active:shadow-[0_2px_0_var(--color-danfo-deep)] disabled:opacity-50"
        >
          <span className="type-slogan text-3xl uppercase">Spray {formatNaira(amount)}</span>
          <span className="text-xs font-bold opacity-80">{target ? `on @${target.handle}` : 'pick someone'}</span>
        </motion.button>
      </div>
      <p className="tabular text-center text-xs text-on-ink-soft" aria-live="polite">
        You’ve sprayed {formatNaira(myTotal)} at this party. Cash in hand {formatNaira(cash)}.
      </p>
    </section>
  );
}

function NoteCounter({ note, count, onChange }: { readonly note: 1_000 | 500; readonly count: number; readonly onChange: (delta: number) => void }) {
  const style = NOTE_STYLE[note];
  return (
    <div className="flex flex-col gap-1.5 rounded-card bg-white/6 p-2">
      <div className="relative h-10">
        {Array.from({ length: Math.min(4, Math.max(1, count)) }, (_, index) => (
          <span
            key={index}
            aria-hidden
            className={cn('absolute inset-x-3 h-8 rounded-[4px] ring-1 ring-black/20', style.bg, count === 0 && 'opacity-30')}
            style={{ top: index * 2, transform: `rotate(${(index - 1.5) * 2.5}deg)` }}
          />
        ))}
        <span className="type-figure absolute inset-x-0 top-1.5 text-center text-sm text-white">{style.label}</span>
      </div>
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => onChange(note === 1_000 ? -5 : -1)}
          disabled={count === 0}
          aria-label={note === 1_000 ? `Five fewer ${style.label} notes` : `One less ${style.label} note`} className="grid size-11 place-items-center rounded-full bg-white/10 disabled:opacity-30">
          <Minus size={18} aria-hidden />
        </button>
        <span className="type-figure text-xl" aria-label={`${count} ${style.label} notes`}>
          ×{count}
        </span>
        <button type="button" onClick={() => onChange(note === 1_000 ? 5 : 1)} aria-label={note === 1_000 ? `Five more ${style.label} notes` : `One more ${style.label} note`} className="grid size-11 place-items-center rounded-full bg-white/10">
          <Plus size={18} aria-hidden />
        </button>
      </div>
    </div>
  );
}
