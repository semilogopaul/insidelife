import type { ReactNode } from 'react';
import { cn } from '@/common/utils/cn';

type Tone = 'neutral' | 'good' | 'bad' | 'warn' | 'info' | 'ankara';

const TONES: Record<Tone, string> = {
  neutral: 'bg-paper-3 text-text-soft',
  good: 'bg-naira-soft text-naira',
  bad: 'bg-okada-soft text-okada',
  warn: 'bg-danfo-soft text-[#7a5600]',
  info: 'bg-cobalt-soft text-cobalt',
  ankara: 'bg-ankara-soft text-ankara',
};

/** Small status label: "Eligible", "On strike", "Pending review". Always pair colour with words. */
export function Badge({ tone = 'neutral', children, className }: { readonly tone?: Tone; readonly children: ReactNode; readonly className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-xs font-bold', TONES[tone], className)}>{children}</span>;
}
