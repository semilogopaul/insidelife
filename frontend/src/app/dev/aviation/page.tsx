import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DevAviationLoader } from './DevAviationLoader';

export const metadata: Metadata = { title: 'Dev · Aviation', robots: { index: false } };

/**
 * Dev-only visual QA for the aviation models: /dev/aviation?view=lineup|apron|flight&cls=light-jet&base=%23f4f2ec&accent=%230a7d3c&name=AIR%20TOLU&reg=5N-TOL&dur=20&q=low
 * (cabins and the terminal lounge/airside are walkable at /dev/interiors?type=aircraft-light-jet and ?type=aviation-terminal).
 */
export default function DevAviationPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <Suspense fallback={null}>
      <DevAviationLoader />
    </Suspense>
  );
}
