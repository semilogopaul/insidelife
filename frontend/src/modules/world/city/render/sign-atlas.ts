import { CITY_MAP, DISTRICTS, findVenue, type CityId, type CityLot, type LotArchetype, type VenueType } from '@insidelife/shared';
import { CanvasTexture, SRGBColorSpace } from 'three';

/**
 * The painted signboards (Lagos signwriting: bold condensed names, a small trade label, strong flat colours), one atlas
 * per city: only the city you are in has its signs in memory (`signAtlasPlan(cityId)`; the other city's are never
 * painted). Each atlas is one or more pages of at most 2048 × 2048 px (4 × 16 slots of 512 × 128, slot 0 a solid dark
 * swatch for posts); a city with more signs than one page holds simply gets another page, and a short last page is cut
 * to the rows it needs. No sign is ever dropped.
 */

export const PAGE_WIDTH = 2048;
export const MAX_PAGE_HEIGHT = 2048;
export const SLOT_W = 512;
export const SLOT_H = 128;
export const SLOTS_PER_ROW = PAGE_WIDTH / SLOT_W;
export const SLOTS_PER_PAGE = SLOTS_PER_ROW * (MAX_PAGE_HEIGHT / SLOT_H);
/** Slot 0 of every page: the dark swatch posts and lightbox backs use. */
export const POST_SLOT = 0;

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
  'aviation-terminal': { background: '#0e4a54', text: '#ffffff', accent: '#e8c35a', label: 'GENERAL AVIATION · PRIVATE FLIGHTS' },
  campus: { background: '#0f5132', text: '#ffffff', accent: '#f6d36b', label: 'UNIVERSITY' },
  market: { background: '#b8321e', text: '#fff7e0', accent: '#f6b90b', label: 'MARKET' },
  mall: { background: '#ffffff', text: '#0e2733', accent: '#f6b90b', label: 'SHOPPING MALL' },
  hospital: { background: '#ffffff', text: '#c62828', accent: '#c62828', label: 'HOSPITAL', icon: 'cross' },
  'office-tower': { background: '#0e2733', text: '#ffffff', accent: '#9fd3df', label: 'CORPORATE OFFICES' },
  office: { background: '#0e2733', text: '#ffffff', accent: '#f6b90b', label: 'TECH HUB' },
  government: { background: '#1a8a4a', text: '#ffffff', accent: '#ffffff', label: 'GOVERNMENT' },
  stadium: { background: '#1a8a4a', text: '#ffffff', accent: '#f6b90b', label: 'SPORTS COMPLEX' },
  park: { background: '#2f6b3a', text: '#f6f0d8', accent: '#f6b90b', label: 'PARK' },
  beach: { background: '#f6b90b', text: '#0e2733', accent: '#0e2733', label: 'BEACH' },
  hotel: { background: '#2e2218', text: '#f2d48a', accent: '#f2d48a', label: 'HOTEL · ROOMS' },
  'event-hall': { background: '#4a1033', text: '#ffe6a8', accent: '#f6b90b', label: 'EVENT CENTRE · WEDDINGS' },
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
  if (venue?.type === 'government' && lot.districtId && DISTRICTS[lot.districtId].cityId === 'lagos' && !/passport/i.test(venue.name)) return { ...base, label: 'LAGOS STATE GOVERNMENT' };
  if (venue?.type === 'government' && /police/i.test(venue.name)) return { ...base, label: 'NIGERIA POLICE FORCE' };
  if (venue?.type === 'government' && /passport/i.test(venue.name)) return { ...base, label: 'NIGERIA IMMIGRATION SERVICE' };
  if (venue && lot.districtId && DISTRICTS[lot.districtId].cityId === 'abuja') {
    // Abuja's boards say what the place is in the capital's terms (Lagos's keep the labels above).
    if (venue.type === 'government' && /embassy|high commission/i.test(venue.name)) return { ...base, background: '#12325c', label: 'EMBASSY · VISAS' };
    if (venue.type === 'government' && /assembly/i.test(venue.name)) return { ...base, background: '#0f5132', accent: '#f6d36b', label: 'FEDERAL REPUBLIC OF NIGERIA' };
    if (venue.type === 'government') return { ...base, label: 'FEDERAL GOVERNMENT' };
    if (venue.type === 'office' && /bank/i.test(venue.name)) return { ...base, background: '#17406f', accent: '#f6b90b', label: 'BANK · BRANCH' };
    if (venue.type === 'office') return { ...base, label: 'CORPORATE HEADQUARTERS' };
    if (venue.type === 'mosque') return { ...base, label: 'MOSQUE' };
    if (venue.type === 'campus') return { ...base, label: /university/i.test(venue.name) ? 'UNIVERSITY' : base.label };
  }
  return base;
}

/** One signboard: the page of the atlas it is painted on and its slot there. */
export interface SignEntry {
  readonly page: number;
  readonly slot: number;
  readonly text: string;
  readonly style: SignStyle;
  readonly lot: CityLot | null;
}

export interface AtlasPage {
  readonly index: number;
  /** Pixel height: as many 128 px rows as the page's signs need (never over 2048). */
  readonly height: number;
  readonly entries: readonly SignEntry[];
}

export const EXTRA_SIGNS = {
  toll: { text: 'LEKKI TOLL PLAZA', style: { background: '#f6b90b', text: '#111111', accent: '#111111', label: 'LEKKI CONCESSION COMPANY' } satisfies SignStyle },
} as const;

/** Showcase places carry their names on their own gates and plates (`showcase-geometry.ts`), not on a signboard. */
const OWN_SIGNAGE: ReadonlySet<LotArchetype> = new Set(['mansion', 'jet-pad', 'refinery']);

const cityOfLot = (lot: CityLot): CityId => DISTRICTS[lot.districtId].cityId;

interface Sign {
  readonly text: string;
  readonly style: SignStyle;
  readonly lot: CityLot | null;
}

/** The signed lots of a city (in lot order) plus any fixed extra signs it has, before they are laid out on pages. */
function signsOfCity(cityId: CityId): readonly Sign[] {
  const signs: Sign[] = [];
  for (const lot of CITY_MAP.lots) {
    if (lot.kind !== 'venue' || !lot.venueId || !lot.entrance || OWN_SIGNAGE.has(lot.archetype ?? 'shop') || cityOfLot(lot) !== cityId) continue;
    signs.push({ text: findVenue(lot.venueId)?.name ?? lot.venueId, style: signStyleFor(lot), lot });
  }
  if (cityId === 'lagos') signs.push({ text: EXTRA_SIGNS.toll.text, style: EXTRA_SIGNS.toll.style, lot: null });
  return signs;
}

const planCache = new Map<CityId, readonly AtlasPage[]>();

/** A city's signs laid out on atlas pages: 63 a page (slot 0 is the post swatch), the last page as short as it can be. */
export function signAtlasPlan(cityId: CityId): readonly AtlasPage[] {
  const cached = planCache.get(cityId);
  if (cached) return cached;
  const signs = signsOfCity(cityId);
  const perPage = SLOTS_PER_PAGE - 1;
  const pages: AtlasPage[] = [];
  for (let start = 0; start < Math.max(1, signs.length); start += perPage) {
    const index = pages.length;
    const entries = signs.slice(start, start + perPage).map((sign, i): SignEntry => ({ page: index, slot: i + 1, ...sign }));
    pages.push({ index, height: Math.ceil((entries.length + 1) / SLOTS_PER_ROW) * SLOT_H, entries });
  }
  planCache.set(cityId, pages);
  return pages;
}

/** Every sign of a city, page by page. */
export function signEntries(cityId: CityId): readonly SignEntry[] {
  return signAtlasPlan(cityId).flatMap((page) => page.entries);
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

/** Draws one page; call again (and flag `needsUpdate`) once web fonts have loaded. */
export function paintAtlasPage(canvas: HTMLCanvasElement, page: AtlasPage): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const display = fontFamily('--font-anybody', "'Arial Narrow', Arial, sans-serif");
  const body = fontFamily('--font-atkinson', 'Arial, sans-serif');
  ctx.clearRect(0, 0, PAGE_WIDTH, page.height);
  for (const entry of page.entries) drawSign(ctx, entry, display, body);
  ctx.fillStyle = '#2b2c2e';
  ctx.fillRect((POST_SLOT % SLOTS_PER_ROW) * SLOT_W, Math.floor(POST_SLOT / SLOTS_PER_ROW) * SLOT_H, SLOT_W, SLOT_H);
}

export function createAtlasTexture(page: AtlasPage): { canvas: HTMLCanvasElement; texture: CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_WIDTH;
  canvas.height = page.height;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, texture };
}

/** UV rectangle [u0, v0, u1, v1] of a slot on a page of `height` px (canvas y grows down; textures flip by default). */
export function slotUv(height: number, slot: number): readonly [number, number, number, number] {
  const x = (slot % SLOTS_PER_ROW) * SLOT_W;
  const y = Math.floor(slot / SLOTS_PER_ROW) * SLOT_H;
  const inset = 2;
  return [(x + inset) / PAGE_WIDTH, 1 - (y + SLOT_H - inset) / height, (x + SLOT_W - inset) / PAGE_WIDTH, 1 - (y + inset) / height];
}
