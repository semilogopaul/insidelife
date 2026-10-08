import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DevAvatarsLoader } from './DevAvatarsLoader';

export const metadata: Metadata = { title: 'Dev · Avatars', robots: { index: false } };

/** Dev-only visual QA: a lineup of avatars in different looks, outfits and animations. */
export default function DevAvatarsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <Suspense fallback={null}>
      <DevAvatarsLoader />
    </Suspense>
  );
}
