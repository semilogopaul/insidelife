import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DevMoments } from './DevMoments';

export const metadata: Metadata = { title: 'Dev · Moments', robots: { index: false } };

/** Dev-only visual QA for the hug and kiss moments (`?kind=hug|kiss`). */
export default function DevMomentsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <Suspense fallback={null}>
      <DevMoments />
    </Suspense>
  );
}
