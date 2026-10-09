/**
 * Brand constants for places that cannot read CSS variables: the web app manifest, `<meta name="theme-color">`, the
 * generated icons and the OpenGraph card. Colours mirror the `@theme` tokens in `src/styles/globals.css` (a test keeps
 * them in sync).
 *
 * No imports: `scripts/generate-icons.mjs` loads this file directly with Node's type stripping.
 */
export const BRAND_COLORS = {
  danfo: '#f6b90b',
  danfoDeep: '#d99c00',
  danfoSoft: '#fff1c2',
  ink: '#0e2733',
  lagoon: '#13606b',
  paper: '#ffffff',
  onInk: '#f4f7f5',
  onInkSoft: '#a9c0c8',
  okada: '#e2412e',
  ankara: '#c8287a',
  cobalt: '#2457d6',
} as const;

export type BrandColor = keyof typeof BRAND_COLORS;

export const APP_NAME = 'Inside Life';
export const APP_TAGLINE = 'Live your whole life in Lagos.';
export const APP_DESCRIPTION =
  'A multiplayer life in Lagos: write JAMB, hustle, drive across Third Mainland Bridge, marry, build a house and pass it on. Every naira earned.';
