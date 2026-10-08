'use client';

import { Dices } from 'lucide-react';
import dynamic from 'next/dynamic';
import type { Appearance, Gender, Outfit } from '@insidelife/shared';
import { Wordmark } from '@/common/components';
import type { AvatarClip } from '@/common/three/avatar';

/** The WebGL preview is the heaviest part of the creator: load it lazily, client only. */
const AvatarPreview = dynamic(() => import('./AvatarPreview').then((module) => module.AvatarPreview), {
  ssr: false,
  loading: () => <StageLoading />,
});

function StageLoading() {
  return (
    <div className="absolute inset-0 grid place-items-center" role="status">
      <span className="h-40 w-24 animate-pulse rounded-[40%] bg-white/10" />
      <span className="sr-only">Loading your preview</span>
    </div>
  );
}

export interface CreatorStageProps {
  readonly appearance: Appearance;
  readonly gender: Gender;
  readonly outfit: Outfit;
  readonly changeTick: number;
  readonly displayName: string;
  readonly handle: string;
  readonly animation: AvatarClip;
  readonly reducedMotion: boolean;
  /** Shown on the look step. */
  readonly onRandomise?: () => void;
}

/** The studio: a warm portrait-studio backdrop with the avatar on a turntable and a name sticker. */
export function CreatorStage({ appearance, gender, outfit, changeTick, displayName, handle, animation, reducedMotion, onRandomise }: CreatorStageProps) {
  return (
    <section
      aria-label="Character preview"
      className="relative isolate h-[42dvh] min-h-[280px] shrink-0 overflow-hidden lg:h-dvh lg:min-h-0 lg:flex-1"
      style={{
        background:
          'radial-gradient(120% 80% at 50% 38%, #2a6f78 0%, #174b57 38%, #0e2733 78%), linear-gradient(#0e2733, #0e2733)',
      }}
    >
      {/* Studio floor glow. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-[radial-gradient(60%_80%_at_50%_100%,rgba(246,185,11,0.22),transparent_70%)]" />
      <AvatarPreview appearance={appearance} gender={gender} outfit={outfit} changeTick={changeTick} animation={animation} reducedMotion={reducedMotion} />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4 lg:p-6">
        <Wordmark size="sm" className="text-danfo" />
        {onRandomise && (
          <button
            type="button"
            onClick={onRandomise}
            className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-paper px-4 text-sm font-bold text-ink shadow-lift transition active:translate-y-px"
          >
            <Dices size={18} aria-hidden />
            Surprise me
          </button>
        )}
      </div>
      {(displayName || handle) && (
        <div className="pointer-events-none absolute bottom-7 left-4 flex lg:inset-x-0 lg:bottom-8 lg:left-0 lg:justify-center">
          <p className="danfo-stripes rounded-chip bg-danfo px-3 pb-1 pt-3 text-center text-ink shadow-glass">
            <span className="type-title block text-lg leading-none">{displayName || 'New Lagosian'}</span>
            {handle && <span className="text-xs font-bold">@{handle}</span>}
          </p>
        </div>
      )}
    </section>
  );
}
