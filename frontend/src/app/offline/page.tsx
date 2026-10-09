import type { Metadata } from 'next';
import { OfflineScreen } from '@/common/pwa';

export const metadata: Metadata = { title: 'Offline', robots: { index: false } };

/** Precached by the service worker and served for any page that can't reach the network. */
export default function OfflinePage() {
  return <OfflineScreen />;
}
