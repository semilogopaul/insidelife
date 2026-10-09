import type { MetadataRoute } from 'next';
import { APP_DESCRIPTION, APP_NAME, BRAND_COLORS } from '@/common/brand/brand';

/**
 * Web app manifest (served at /manifest.webmanifest and linked automatically). Icons are generated into `public/` by
 * `npm run icons`; the screenshots are captures of `/dev/world`. The game launches straight into `/play`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    lang: 'en-NG',
    dir: 'ltr',
    start_url: '/play',
    scope: '/',
    // Immersive on phones (no status or navigation bars); browsers without fullscreen apps fall back to standalone.
    display: 'standalone',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'any',
    // Launching again brings the running game forward instead of opening a second session.
    launch_handler: { client_mode: ['focus-existing', 'auto'] },
    theme_color: BRAND_COLORS.ink,
    background_color: BRAND_COLORS.ink,
    categories: ['games', 'entertainment', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Shown in Chrome's install dialog: the 3D city in Yaba by UNILAG.
    screenshots: [
      { src: '/screenshots/play-wide.jpg', sizes: '1440x900', type: 'image/jpeg', form_factor: 'wide', label: 'Driving through Yaba, by UNILAG and the lagoon' },
      { src: '/screenshots/play-narrow.jpg', sizes: '780x1688', type: 'image/jpeg', form_factor: 'narrow', label: 'Yaba on your phone, minimap and all' },
    ],
  };
}
