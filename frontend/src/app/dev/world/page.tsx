import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DevWorld } from './DevWorld';

/** Development-only city viewer (no auth): `/dev/world?hour=18&weather=haze&at=unilag&to=eko-hotel`. */
export default function DevWorldPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <Suspense fallback={null}>
      <DevWorld />
    </Suspense>
  );
}
