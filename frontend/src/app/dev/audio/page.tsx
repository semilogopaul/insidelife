import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AudioLab } from '@/modules/audio';

export const metadata: Metadata = { title: 'Audio lab', robots: { index: false, follow: false } };

/** Dev-only: exercise every sound, music context and ambience. 404 in production builds. */
export default function AudioLabPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <AudioLab />;
}
