'use client';

import { useState } from 'react';
import type { ChatMediaDto } from '@insidelife/shared';
import { Sheet } from '@/common/components';

const THUMB_WIDTH = 220;

/** A photo bubble: a sized thumbnail (no layout jump) that opens full size. */
export function PhotoMessage({ media, from }: { readonly media: ChatMediaDto; readonly from: string }) {
  const [open, setOpen] = useState(false);
  const width = media.width ?? THUMB_WIDTH;
  const height = media.height ?? THUMB_WIDTH;
  const thumbHeight = Math.round(Math.min(320, (THUMB_WIDTH * height) / width));
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Open photo from ${from}`} className="-mx-1.5 -mt-0.5 block overflow-hidden rounded-[14px] bg-ink/10">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, private, already-sized media; next/image would proxy and cache it */}
        <img src={media.url} alt={`Photo from ${from}`} width={THUMB_WIDTH} height={thumbHeight} loading="lazy" decoding="async" className="block object-cover" style={{ width: THUMB_WIDTH, height: thumbHeight }} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Photo from ${from}`} size="lg">
        {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
        <img src={media.url} alt={`Photo from ${from}`} width={width} height={height} className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-card object-contain" />
      </Sheet>
    </>
  );
}
