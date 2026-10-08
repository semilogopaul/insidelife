import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DevInteriorsLoader } from './DevInteriorsLoader';

export const metadata: Metadata = { title: 'Dev · Interiors', robots: { index: false } };

/** Dev-only visual QA for interior templates: /dev/interiors?type=club&hour=21&anim=dance&nepa=1&spray=1 */
export default function DevInteriorsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <Suspense fallback={null}>
      <DevInteriorsLoader />
    </Suspense>
  );
}
