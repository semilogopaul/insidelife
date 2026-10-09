#!/usr/bin/env node
/**
 * Brand icon pipeline. Renders the app mark (`src/common/brand/app-mark.ts`, the same geometry the `<AppMark>`
 * component draws) to every icon the web app and the PWA need, plus the OpenGraph card:
 *
 *   public/icon.svg                     SVG favicon (compact mark on the rounded tile)
 *   public/favicon.ico                  16, 32 and 48 px PNGs in one ICO (compact mark)
 *   public/icons/icon-{192,512}.png     manifest icons, purpose "any" (rounded tile, transparent corners)
 *   public/icons/maskable-{192,512}.png manifest icons, purpose "maskable" (full bleed, mark inside the 80% safe zone)
 *   public/icons/apple-touch-icon.png   180 px, full bleed (iOS rounds the corners itself)
 *   public/og.png                       1200×630 OpenGraph / Twitter card
 *
 * The OG card letters "INSIDE LIFE" as paths (no font files needed); the tagline uses the system sans.
 * Idempotent; re-run after changing the mark or the brand colours:
 *
 *   npm run icons -w @insidelife/frontend
 *
 * Node ≥ 24 loads the TypeScript brand modules directly (type stripping).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { APP_MARK_MASKABLE_SCALE, appMarkSvg } from '../src/common/brand/app-mark.ts';
import { APP_TAGLINE, BRAND_COLORS } from '../src/common/brand/brand.ts';

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(FRONTEND, 'public');
const ICONS = join(PUBLIC, 'icons');
const C = BRAND_COLORS;
/** iOS masks the touch icon to a squircle with no safe-zone spec; keep a launcher-like margin. */
const APPLE_SCALE = 0.84;

function write(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log(`  ${relative(FRONTEND, path)} (${(data.length / 1024).toFixed(1)} KB)`);
}

/** Rasterises an SVG string at exactly `width`×`height` (density keeps librsvg from upscaling a small bitmap). */
function rasterise(svg, width, height = width) {
  return sharp(Buffer.from(svg), { density: Math.max(72, (72 * width) / 64) })
    .resize(width, height)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/** ICO container holding PNG images (supported by every browser since IE Vista-era). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

/**
 * "INSIDE LIFE" lettered like the danfo-slogan wordmark (heavy, condensed): cap height 100, stems 22, bars 20.
 * Returns the paths and the total advance width.
 */
function lettering() {
  const glyphs = {
    I: { w: 22, d: 'M0 0H22V100H0Z' },
    N: { w: 60, d: 'M0 0H26L38 40V0H60V100H34L22 60V100H0Z' },
    S: {
      w: 54,
      stroke: 'M43.5 30V24Q43.5 10.5 30 10.5H24Q10.5 10.5 10.5 24V35Q10.5 48.5 24 49.5H30Q43.5 50.5 43.5 64V76Q43.5 89.5 30 89.5H24Q10.5 89.5 10.5 76V70',
    },
    D: { w: 56, d: 'M0 0H30Q56 0 56 26V74Q56 100 30 100H0ZM22 20V80H30Q34 80 34 74V26Q34 20 30 20Z' },
    E: { w: 46, d: 'M0 0H46V20H22V40H42V60H22V80H46V100H0Z' },
    L: { w: 44, d: 'M0 0H22V80H44V100H0Z' },
    F: { w: 46, d: 'M0 0H46V20H22V40H42V60H22V100H0Z' },
  };
  const parts = [];
  let x = 0;
  for (const char of 'INSIDE LIFE') {
    if (char === ' ') {
      x += 24 - 7;
      continue;
    }
    const glyph = glyphs[char];
    parts.push(
      glyph.stroke
        ? `<path transform="translate(${x} 0)" d="${glyph.stroke}" fill="none" stroke="currentColor" stroke-width="21"/>`
        : `<path transform="translate(${x} 0)" d="${glyph.d}" fill-rule="evenodd"/>`,
    );
    x += glyph.w + 7;
  }
  return { svg: parts.join(''), width: x - 7 };
}

function ogCard() {
  const W = 1200;
  const H = 630;
  const word = lettering();
  const cap = 118;
  const scale = cap / 100;
  const textX = 452;
  const textY = 150;
  const wordWidth = Math.round(word.width * scale);
  const mark = appMarkSvg({ colors: C }).replace('<svg ', '<svg x="96" y="138" width="300" height="300" ');
  const font = "'Atkinson Hyperlegible Next', 'Helvetica Neue', Helvetica, Arial, sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${C.ink}"/>
  ${mark}
  <g transform="translate(${textX} ${textY}) scale(${scale})" fill="${C.danfo}" color="${C.danfo}">${word.svg}</g>
  <g fill="${C.danfo}">
    <rect x="${textX}" y="${textY + cap + 22}" width="${wordWidth}" height="11"/>
    <rect x="${textX}" y="${textY + cap + 41}" width="${wordWidth}" height="11"/>
  </g>
  <text x="${textX}" y="${textY + cap + 122}" fill="${C.onInk}" font-family="${font}" font-size="40" font-weight="700">${APP_TAGLINE}</text>
  <text x="${textX}" y="${textY + cap + 172}" fill="${C.onInkSoft}" font-family="${font}" font-size="28">Play free in your browser, or install it like an app.</text>
  <rect y="${H - 54}" width="${W}" height="54" fill="${C.danfo}"/>
  <rect y="${H - 38}" width="${W}" height="7" fill="${C.ink}"/>
  <rect y="${H - 24}" width="${W}" height="7" fill="${C.ink}"/>
</svg>`;
}

console.log('Generating brand icons…');

write(join(PUBLIC, 'icon.svg'), Buffer.from(`${appMarkSvg({ colors: C, compact: true })}\n`));

const favicons = await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await rasterise(appMarkSvg({ colors: C, compact: true }), size) })));
write(join(PUBLIC, 'favicon.ico'), ico(favicons));

for (const size of [192, 512]) {
  write(join(ICONS, `icon-${size}.png`), await rasterise(appMarkSvg({ colors: C }), size));
  write(join(ICONS, `maskable-${size}.png`), await rasterise(appMarkSvg({ colors: C, background: 'full-bleed', scale: APP_MARK_MASKABLE_SCALE }), size));
}
write(join(ICONS, 'apple-touch-icon.png'), await rasterise(appMarkSvg({ colors: C, background: 'full-bleed', scale: APPLE_SCALE }), 180));

write(
  join(PUBLIC, 'og.png'),
  await sharp(Buffer.from(ogCard())).png({ compressionLevel: 9, adaptiveFiltering: true, palette: true, quality: 95 }).toBuffer(),
);

console.log('Done.');
