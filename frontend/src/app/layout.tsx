import type { Metadata, Viewport } from 'next';
import { Anybody, Atkinson_Hyperlegible_Next } from 'next/font/google';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import { Providers } from './providers';

const anybody = Anybody({
  subsets: ['latin'],
  variable: '--font-anybody',
  axes: ['wdth'],
  display: 'swap',
});

const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ['latin'],
  variable: '--font-atkinson',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Inside Life — your life in Lagos', template: '%s · Inside Life' },
  description:
    'A multiplayer life in Lagos: write JAMB, hustle, drive across Third Mainland Bridge, marry, build a house and pass it on. Every naira earned.',
  applicationName: 'Inside Life',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#0e2733',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en-NG" className={`${anybody.variable} ${atkinson.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
