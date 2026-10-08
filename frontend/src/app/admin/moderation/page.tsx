import type { Metadata } from 'next';
import { ModerationConsole } from '@/modules/admin';

export const metadata: Metadata = { title: 'Moderation', robots: { index: false, follow: false } };

/** Moderator console for paid billboard ads and club plays (the API enforces the admin role). */
export default function ModerationPage() {
  return <ModerationConsole />;
}
