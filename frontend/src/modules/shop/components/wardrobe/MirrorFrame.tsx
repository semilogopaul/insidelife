'use client';

import dynamic from 'next/dynamic';
import { useState, type ReactNode } from 'react';
import type { Appearance, Outfit } from '@insidelife/shared';
import { ErrorBoundary, Spinner } from '@/common/components';

const AvatarPreview = dynamic(() => import('./AvatarPreview').then((module) => module.AvatarPreview), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-on-ink-soft">
      <Spinner />
    </div>
  ),
});

function webglAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    // Probe only: hand the context back so it doesn't count against the browser's limit.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

/** The mirror panel: the live 3D preview when the device can draw it, a friendly note when it can't. */
export function MirrorFrame({
  appearance,
  outfit,
  mood,
  caption,
}: {
  readonly appearance: Appearance;
  readonly outfit: Outfit;
  readonly mood: number;
  readonly caption: ReactNode;
}) {
  const [supported] = useState(webglAvailable);
  const fallback = (
    <p className="grid h-full place-items-center px-6 text-center text-sm text-on-ink-soft">
      Mirror no dey work on this device. The list below is exactly what you’ll wear.
    </p>
  );
  return (
    <figure className="relative overflow-hidden rounded-card bg-[radial-gradient(120%_90%_at_50%_100%,#24546a_0%,var(--color-ink)_70%)]">
      <div className="h-60" aria-hidden>
        {supported ? (
          <ErrorBoundary fallback={() => fallback}>
            <AvatarPreview appearance={appearance} outfit={outfit} mood={mood} />
          </ErrorBoundary>
        ) : (
          fallback
        )}
      </div>
      <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-ink/90 to-transparent px-3.5 pb-3 pt-8 text-on-ink">
        {caption}
      </figcaption>
    </figure>
  );
}
