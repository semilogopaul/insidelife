'use client';

import { motion } from 'motion/react';
import { cn } from '@/common/utils/cn';
import { momentCopy, type MomentCopySource } from './moment-copy';

export interface VenueMomentBannerProps {
  readonly moment: MomentCopySource;
  /** `headline`: the big shoutout card; `chip`: a bottle or an experience under it. */
  readonly variant: 'headline' | 'chip';
  /** Calm version: no confetti, no glow pulse. */
  readonly reducedMotion: boolean;
  /** Tap the name to see who it is (profile: block and report live there). Omit for previews. */
  readonly onOpenProfile?: (handle: string) => void;
  readonly className?: string;
}

const CONFETTI = ['#f6b90b', '#0f8a4f', '#c8287a', '#2457d6', '#ffffff', '#e2412e'];
const PIECES = Array.from({ length: 14 }, (_, index) => index);

/**
 * What the whole room sees: a bold name on screen. Shoutout tiers get louder (basic → big with confetti → odogwu in
 * gold); bottles and experiences are a smaller chip. Used by the HUD and by the Night out panel's preview.
 */
export function VenueMomentBanner({ moment, variant, reducedMotion, onOpenProfile, className }: VenueMomentBannerProps) {
  const copy = momentCopy(moment);
  const nameButton = (label: string, handle: string, extra: string) =>
    onOpenProfile ? (
      <button type="button" onClick={() => onOpenProfile(handle)} className={cn('pointer-events-auto underline-offset-4 hover:underline', extra)}>
        {label}
      </button>
    ) : (
      <span className={extra}>{label}</span>
    );

  if (variant === 'chip') {
    return (
      <div role="status" className={cn('glass flex max-w-full items-center gap-2 rounded-full py-1.5 pl-2 pr-4 text-sm font-bold text-on-ink', className)}>
        <span aria-hidden className="text-lg">
          {moment.emoji}
        </span>
        <span className="truncate">
          <span className="text-on-ink-soft">{copy.eyebrow.replace(/^\S+\s/, '')} · </span>
          {nameButton(copy.name, moment.to && moment.kind === 'birthday' ? moment.to.handle : moment.from.handle, 'text-danfo')}
          {moment.kind === 'bottle' ? `: ${copy.text}` : copy.text ? ` ${copy.text}` : ''}
        </span>
      </div>
    );
  }

  const odogwu = moment.tier === 'shoutout-odogwu';
  const big = moment.tier === 'shoutout-big' || odogwu;
  return (
    <div
      role="status"
      aria-label={copy.line}
      className={cn(
        'relative w-full max-w-md overflow-hidden rounded-sheet px-5 pb-4 pt-3 text-center shadow-[var(--shadow-lift)]',
        odogwu ? 'bg-gradient-to-br from-[#ffe08a] via-danfo to-[#c98a00] text-ink' : 'glass text-on-ink',
        big && !odogwu && 'ring-2 ring-ankara',
        className,
      )}
    >
      {odogwu && !reducedMotion && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-sheet ring-4 ring-white/70"
          animate={{ opacity: [0.2, 0.9, 0.2] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <p aria-hidden className={cn('text-xs font-bold uppercase tracking-[0.18em]', odogwu ? 'text-ink/80' : 'text-on-ink-soft')}>
        {copy.eyebrow}
      </p>
      <p aria-hidden className={cn('type-slogan mt-1 break-words uppercase', odogwu ? 'text-6xl text-ink' : big ? 'text-5xl text-danfo' : 'text-4xl text-danfo')}>
        {nameButton(copy.name, moment.kind === 'birthday' && moment.to ? moment.to.handle : moment.from.handle, '')}
      </p>
      {copy.text && (
        <p aria-hidden className={cn('mt-1.5 break-words text-lg font-bold leading-snug', odogwu ? 'text-ink' : 'text-on-ink')}>
          {moment.kind === 'shoutout' ? `“${copy.text}”` : copy.text}
        </p>
      )}
      {big && !reducedMotion && (
        <span aria-hidden className="pointer-events-none absolute inset-0">
          {PIECES.map((index) => (
            <motion.span
              key={index}
              className="absolute top-0 h-2.5 w-1.5 rounded-[2px]"
              style={{ left: `${4 + index * 7}%`, backgroundColor: CONFETTI[index % CONFETTI.length] }}
              initial={{ y: -12, rotate: 0, opacity: 0 }}
              animate={{ y: 150, rotate: (index % 2 ? 1 : -1) * 360, opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2.4, delay: (index % 5) * 0.18, repeat: Infinity, repeatDelay: 0.6, ease: 'easeIn' }}
            />
          ))}
        </span>
      )}
    </div>
  );
}
