import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DevSocialRoot } from './DevSocialRoot';

export const metadata: Metadata = { title: 'Social lab', robots: { index: false, follow: false } };

/** Dev-only: the game's HUD, phone and social/meta layers without the 3D world. 404 in production builds. */
export default function SocialLabPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevSocialRoot />;
}
