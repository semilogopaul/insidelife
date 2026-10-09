import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DevIcons } from './DevIcons';

export const metadata: Metadata = { title: 'Dev · Icons', robots: { index: false, follow: false } };

/** Dev-only visual QA for the phone's app icons and the place pictograms, at every size they're used. */
export default function DevIconsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevIcons />;
}
