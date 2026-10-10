import { CITY_MAP, findVenue, type CityLot, type LotArchetype, type VenueType } from '@insidelife/shared';
import { CanvasTexture, SRGBColorSpace } from 'three';

/**
 * One canvas atlas with a painted signboard per venue (Lagos signwriting: bold condensed names, a small trade label,
 * strong flat colours). 4 × 16 slots of 512 × 128 px; slot 63 is a solid dark swatch for posts.
 */

export const ATLAS_SIZE = 2048;
export const SLOT_W = 512;
export const SLOT_H = 128;
export const SLOTS_PER_ROW = ATLAS_SIZE / SLOT_W;
export const POST_SLOT = 63;

export interface SignStyle {
  readonly background: string;
  readonly text: string;
  readonly accent: string;
  readonly label: string;
  readonly icon?: 'cross' | 'neon';
}

const BY_TYPE: Partial<Readonly<Record<VenueType, Omit<SignStyle, 'label'> & { label?: string }>>> = {
  buka: { background: '#e8742b', text: '#fff8ea', accent: '#0e2733', label: 'BUKA · AMALA' },
  restaurant: { background: '#2a211a', text: '#f2d48a', accent: '#f2d48a', label: 'RESTAURANT' },
  pharmacy: { background: '#0f8a4f', text: '#ffffff', accent: '#ffffff', label: 'PHARMACY', icon: 'cross' },
  gym: { background: '#18191b', text: '#f6b90b', accent: '#f6b90b', label: 'GYM & FITNESS' },
  salon: { background: '#c8287a', text: '#ffffff', accent: '#ffe1f0', label: 'SALON · BARBING' },
  'cbt-centre': { background: '#2457d6', text: '#ffffff', accent: '#f6b90b', label: 'JAMB · CBT CENTRE' },
  cinema: { background: '#4b1780', text: '#ffffff', accent: '#f6b90b', label: 'CINEMAS' },
  'estate-agency': { background: '#13606b', text: '#ffffff', accent: '#f6b90b', label: 'ESTATE AGENTS' },
  bar: { background: '#111214', text: '#ff5bd6', accent: '#ff5bd6', label: 'LOUNGE · BAR', icon: 'neon' },
  club: { background: '#0b0b0d', text: '#ff4fd8', accent: '#46e0ff', label: 'NIGHTCLUB', icon: 'neon' },
  school: { background: '#2457d6', text: '#ffffff', accent: '#f6b90b', label: 'NURSERY · PRIMARY · SECONDARY' },
};

const BY_ARCHETYPE: Readonly<Record<LotArchetype, SignStyle>> = {
  airport: { background: '#13606b', text: '#ffffff', accent: '#f6b90b', label: 'INTERNATIONAL AIRPORT' },
  campus: { background: '#0f5132', text: '#ffffff', accent: '#f6d36b', label: 'UNIVERSITY' },
  market: { background: '#b8321e', text: '#fff7e0', accent: '#f6b90b', label: 'MARKET' },
  mall: { background: '#ffffff', text: '#0e2733', accent: '#f6b90b', label: 'SHOPPING MALL' },
  hospital: { background: '#ffffff', text: '#c62828', accent: '#c62828', label: 'HOSPITAL', icon: 'cross' },
  'office-tower': { background: '#0e2733', text: '#ffffff', accent: '#9fd3df', label: 'CORPORATE OFFICES' },
  office: { background: '#0e2733', text: '#ffffff', accent: '#f6b90b', label: 'TECH HUB' },
  government: { background: '#1a8a4a', text: '#ffffff', accent: '#ffffff', label: 'LAGOS STATE GOVERNMENT' },
  stadium: { background: '#1a8a4a', text: '#ffffff', accent: '#f6b90b', label: 'SPORTS COMPLEX' },
  park: { background: '#2f6b3a', text: '#f6f0d8', accent: '#f6b90b', label: 'PARK' },
  beach: { background: '#f6b90b', text: '#0e2733', accent: '#0e2733', label: 'BEACH' },
  hotel: { background: '#2e2218', text: '#f2d48a', accent: '#f2d48a', label: 'HOTEL · EVENTS' },
  club: { background: '#0b0b0d', text: '#ff4fd8', accent: '#46e0ff', label: 'LOUNGE', icon: 'neon' },
  mosque: { background: '#1f6b45', text: '#ffffff', accent: '#e8c766', label: 'CENTRAL MOSQUE' },
  church: { background: '#2b3f8f', text: '#ffffff', accent: '#f6d36b', label: 'CHURCH' },
  'motor-park': { background: '#f6b90b', text: '#111111', accent: '#111111', label: 'MOTOR PARK · BRT' },
  'car-dealer': { background: '#c62828', text: '#ffffff', accent: '#ffffff', label: 'CARS · TOKUNBO & NEW' },
  shop: { background: '#e8742b', text: '#ffffff', accent: '#0e2733', label: 'SHOP' },
  school: { background: '#2457d6', text: '#ffffff', accent: '#f6b90b', label: 'SCHOOLS' },
  mansion: { background: '#141414', text: '#e8c35a', accent: '#e8c35a', label: 'IKOYI · OPEN HOUSE' },
  'jet-pad': { background: '#141414', text: '#e8c35a', accent: '#ffffff', label: 'PRIVATE JET · BOARD HERE' },
  refinery: { background: '#1d4f91', text: '#ffffff', accent: '#e23b2e', label: 'VISITOR CENTRE · TOURS' },
};

export function signStyleFor(lot: CityLot): SignStyle {
  const venue = lot.venueId ? findVenue(lot.venueId) : undefined;
  const base = BY_ARCHETYPE[lot.archetype ?? 'shop'];
  const typed = venue ? BY_TYPE[venue.type] : undefined;
  if (typed && (lot.archetype === 'shop' || lot.archetype === 'club')) return { ...base, ...typed, label: typed.label ?? base.label };
  if (venue?.type === 'campus' && /college|technology/i.test(venue.name)) return { ...base, label: 'COLLEGE OF TECHNOLOGY' };
  if (venue?.type === 'hospital-private') return { ...base, label: 'SPECIALIST HOSPITAL' };
  if (venue?.type === 'gym' && lot.archetype === 'park') return { ...base, background: '#0e2733', label: 'MEMBERS CLUB · EST. 1938' };
  if (venue?.type === 'government' && /passport/i.test(venue.name)) return { ...base, label: 'NIGERIA IMMIGRATION SERVICE' };
  return base;
}

/** Venue lots that get a sign, in atlas order (plus fixed extra signs). */
export interface SignEntry {
  readonly slot: number;
  readonly text: string;
  readonly style: SignStyle;
  readonly lot: CityLot | null;
}

export const EXTRA_SIGNS = {
  toll: { text: 'LEKKI TOLL PLAZA', style: { background: '#f6b90b', text: '#111111', accent: '#111111', label: 'LEKKI CONCESSION COMPANY' } satisfies SignStyle },
} as const;

/** Showcase places carry their names on their own gates and plates (`showcase-geometry.ts`), not on a signboard. */
const OWN_SIGNAGE: ReadonlySet<LotArchetype> = new Set(['mansion', 'jet-pad', 'refinery']);

export function signEntries(): readonly SignEntry[] {
  const entries: SignEntry[] = [];
  for (const lot of CITY_MAP.lots) {
    if (lot.kind !== 'venue' || !lot.venueId || !lot.entrance || OWN_SIGNAGE.has(lot.archetype ?? 'shop')) continue;
    if (entries.length >= POST_SLOT - 1) break;
    const venue = findVenue(lot.venueId);
    entries.push({ slot: entries.length, text: venue?.name ?? lot.venueId, style: signStyleFor(lot), lot });
  }
  entries.push({ slot: entries.length, text: EXTRA_SIGNS.toll.text, style: EXTRA_SIGNS.toll.style, lot: null });
  return entries;
}

function fontFamily(variable: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSign(ctx: CanvasRenderingContext2D, entry: SignEntry, display: string, body: string): void {
  const x = (entry.slot % SLOTS_PER_ROW) * SLOT_W;
  const y = Math.floor(entry.slot / SLOTS_PER_ROW) * SLOT_H;
  const { style } = entry;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#1b1d1f';
  ctx.fillRect(0, 0, SLOT_W, SLOT_H);
  roundRect(ctx, 4, 4, SLOT_W - 8, SLOT_H - 8, 10);
  ctx.fillStyle = style.background;
  ctx.fill();
  // Danfo double stripe along the bottom edge.
  ctx.fillStyle = style.accent;
  ctx.fillRect(16, SLOT_H - 22, SLOT_W - 32, 4);
  ctx.fillRect(16, SLOT_H - 14, SLOT_W - 32, 4);
  let left = 22;
  if (style.icon === 'cross') {
    ctx.fillStyle = style.text === '#ffffff' ? '#ffffff' : '#c62828';
    ctx.fillRect(24, 34, 52, 16);
    ctx.fillRect(42, 16, 16, 52);
    left = 92;
  }
  ctx.fillStyle = style.text;
  ctx.globalAlpha = 0.85;
  ctx.font = `700 15px ${body}`;
  ctx.textBaseline = 'top';
  ctx.fillText(style.label, left, 14);
  ctx.globalAlpha = 1;
  const text = entry.text.toUpperCase();
  let size = 56;
  ctx.font = `900 ${size}px ${display}`;
  const available = SLOT_W - left - 22;
  while (ctx.measureText(text).width > available && size > 22) {
    size -= 2;
    ctx.font = `900 ${size}px ${display}`;
  }
  if (style.icon === 'neon') {
    ctx.shadowColor = style.text;
    ctx.shadowBlur = 14;
  }
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, left, 34 + size * 0.95);
  ctx.restore();
}

/** Draws the atlas; call again (and flag `needsUpdate`) once web fonts have loaded. */
export function paintAtlas(canvas: HTMLCanvasElement, entries: readonly SignEntry[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const display = fontFamily('--font-anybody', "'Arial Narrow', Arial, sans-serif");
  const body = fontFamily('--font-atkinson', 'Arial, sans-serif');
  ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  for (const entry of entries) drawSign(ctx, entry, display, body);
  const px = (POST_SLOT % SLOTS_PER_ROW) * SLOT_W;
  const py = Math.floor(POST_SLOT / SLOTS_PER_ROW) * SLOT_H;
  ctx.fillStyle = '#2b2c2e';
  ctx.fillRect(px, py, SLOT_W, SLOT_H);
}

export function createAtlasTexture(): { canvas: HTMLCanvasElement; texture: CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, texture };
}

/** UV rectangle [u0, v0, u1, v1] of a slot (canvas y grows down; textures flip by default). */
export function slotUv(slot: number): readonly [number, number, number, number] {
  const x = (slot % SLOTS_PER_ROW) * SLOT_W;
  const y = Math.floor(slot / SLOTS_PER_ROW) * SLOT_H;
  const inset = 2;
  return [(x + inset) / ATLAS_SIZE, 1 - (y + SLOT_H - inset) / ATLAS_SIZE, (x + SLOT_W - inset) / ATLAS_SIZE, 1 - (y + inset) / ATLAS_SIZE];
}
