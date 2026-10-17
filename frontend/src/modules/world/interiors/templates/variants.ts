import { VENUES, findVenue, type VenueDefinition } from '@insidelife/shared';
import type { PropSpec } from '../props/prop-types';
import type { FloorStyle, FurniturePlacement, InteriorTemplate, NpcSpot, PlayerSpots, RoomSpec, WallSpec } from './types';

/**
 * Venues of one type share an interior template, so on their own they'd all look and read the same (every market a
 * Balogun, every club "The Vault"). A venue's room is its template, dressed as that venue:
 *
 * - its name is on the board (signs flagged `venueName` carry the name of the venue you entered);
 * - its paint is its own: same-type venues are spread evenly round the colour wheel, and name boards take a brand
 *   colour of their own;
 * - venues people mix up get an authored look (`LOOKS`): Computer Village is a maze of phone stalls, cables and
 *   generators; Freedom Park a lawn with a colonial gate and sculptures; the National Stadium a running track.
 *
 * Pure; the result keeps the template's id (so everything keyed by it works) and is cached per venue.
 */

type Goods = Extract<PropSpec, { kind: 'stall' }>['goods'];

/** An authored look: what a venue changes about the template of its type. */
interface Look {
  /** The template this look dresses (a venue whose type has another template, such as a stadium, isn't dressed as a park). */
  readonly base: string;
  readonly room?: Partial<Pick<RoomSpec, 'floor' | 'floorColor'>> & { readonly wall?: WallSpec };
  /** The room's stalls, in order, take these goods and umbrellas. */
  readonly stalls?: ReadonlyArray<{ readonly goods: Goods; readonly umbrella: string }>;
  /** Lines under the venue's name on its board (replaces the template's). */
  readonly tagline?: readonly string[];
  /** Name board colours (a neon sign keeps its glow and only takes `fg`). */
  readonly sign?: { readonly bg?: string; readonly fg?: string };
  /** Props of these kinds, and furniture of these models, are taken out. */
  readonly dropProps?: readonly PropSpec['kind'][];
  readonly dropModels?: RegExp;
  /** People standing on something that's gone (a bandstand) leave too. */
  readonly dropRaisedNpcs?: boolean;
  readonly props?: readonly PropSpec[];
  readonly furniture?: readonly FurniturePlacement[];
  readonly player?: PlayerSpots;
  readonly practicalColor?: string;
}

/** Name boards: brand colours (bg, fg) taken in turn by same-type venues. */
const BRANDS: ReadonlyArray<readonly [string, string]> = [
  ['#0e2733', '#f6b90b'],
  ['#7b1fa2', '#ffffff'],
  ['#1b5e20', '#ffeb3b'],
  ['#b71c1c', '#ffffff'],
  ['#0d47a1', '#ffffff'],
  ['#e65100', '#ffffff'],
  ['#004d40', '#f6b90b'],
  ['#3e2723', '#f3d27a'],
];
const NEON = ['#ff2fb1', '#21d4fd', '#76ff03', '#f6b90b', '#ff6d00', '#b388ff', '#ff5252', '#18ffff'] as const;

// ---------------------------------------------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------------------------------------------

function toHsl(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const part = (n: number): string =>
    Math.round(f(n) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${part(0)}${part(8)}${part(4)}`;
}

/** Rotate a colour round the wheel; whites and greys pick up a hint of the new hue so the shift shows. */
export function shiftHue(hex: string, degrees: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const [h, s, l] = toHsl(hex);
  const tinted = s < 0.14 && l > 0.2 && l < 0.97 ? 0.16 : s;
  return fromHsl((h + degrees + 360) % 360, tinted, l);
}

// ---------------------------------------------------------------------------------------------------------------
// Authored looks
// ---------------------------------------------------------------------------------------------------------------

const cables = (at: readonly [number, number], length: number, height = 2.5): PropSpec => ({ kind: 'clothesline', at, length, height, colors: ['#212121', '#c62828', '#fafafa', '#f6b90b', '#1e88e5'] });

const LOOKS: Readonly<Record<string, Look>> = {
  // --- Markets ---------------------------------------------------------------------------------------------------
  'computer-village': {
    base: 'market',
    room: { floor: 'asphalt', floorColor: '#5d5f63' },
    stalls: [
      { goods: 'phones', umbrella: '#1d4e89' },
      { goods: 'phones', umbrella: '#f6b90b' },
      { goods: 'phones', umbrella: '#ffffff' },
      { goods: 'phones', umbrella: '#e2412e' },
      { goods: 'phones', umbrella: '#1e88e5' },
    ],
    tagline: ['PHONES • LAPTOPS • REPAIRS'],
    sign: { bg: '#0d47a1', fg: '#ffffff' },
    dropProps: ['cooler'],
    props: [
      { kind: 'shelf', at: [-5.35, -0.2], rot: 90, size: [2.2, 1.8, 0.4], items: 'boxes', color: '#37474f' },
      { kind: 'shelf', at: [5.35, -1.9], rot: -90, size: [2.0, 1.8, 0.4], items: 'boxes', color: '#37474f' },
      { kind: 'generator', at: [5.2, 0.7], rot: -20 },
      { kind: 'generator', at: [-5.3, 3.5], rot: 30 },
      cables([0, -0.3], 8),
      cables([0.5, 2.6], 6, 2.3),
      { kind: 'sign', at: [-1.8, 3.5], size: [1.5, 0.6], lines: ['ORIGINAL', 'CHARGERS ₦2,500'], bg: '#fff8e1', fg: '#b71c1c', accent: '#0d47a1', style: 'poster' },
      { kind: 'sign', at: [4.4, -3.7], size: [1.6, 0.6], lines: ['UNLOCK • FLASH', 'SCREEN REPAIR'], bg: '#0d47a1', fg: '#ffffff', accent: '#f6b90b', style: 'poster' },
      { kind: 'table-cloth', at: [-2.6, 3.4], size: [1.5, 0.75, 0.8], color: '#263238', trim: '#f6b90b' },
    ],
    furniture: [
      { model: 'laptop', at: [-3.0, 3.4], rot: 180, y: 0.75 },
      { model: 'computerScreen', at: [-2.4, 3.4], rot: 180, y: 0.75 },
      { model: 'speaker', at: [5.3, 3.3], rot: -90 },
    ],
  },
  'yaba-market': {
    base: 'market',
    room: { floorColor: '#9a8466' },
    stalls: [
      { goods: 'fabric', umbrella: '#c8287a' },
      { goods: 'shoes', umbrella: '#f6b90b' },
      { goods: 'fabric', umbrella: '#00897b' },
      { goods: 'shoes', umbrella: '#7b1fa2' },
      { goods: 'fabric', umbrella: '#e2412e' },
    ],
    tagline: ['OKRIKA • DIG WELL'],
    props: [
      { kind: 'shelf', at: [-5.35, -0.4], rot: 90, size: [2.6, 1.7, 0.5], items: 'clothes', color: '#78909c' },
      { kind: 'shelf', at: [5.35, 0.6], rot: -90, size: [2.6, 1.7, 0.5], items: 'clothes', color: '#78909c' },
      { kind: 'clothesline', at: [0, -0.4], length: 7, height: 2.3, colors: ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#ffffff', '#8e24aa'] },
      { kind: 'sign', at: [-1.8, 3.4], size: [1.5, 0.6], lines: ['BALE ₦1,500', 'FRESH FROM LONDON'], bg: '#fff8e1', fg: '#6a1b9a', accent: '#c62828', style: 'poster' },
    ],
  },
  'mushin-market': {
    base: 'market',
    room: { floorColor: '#8d7455' },
    stalls: [
      { goods: 'tomatoes', umbrella: '#e2412e' },
      { goods: 'peppers', umbrella: '#0f8a4f' },
      { goods: 'peppers', umbrella: '#e65100' },
      { goods: 'tomatoes', umbrella: '#c62828' },
      { goods: 'peppers', umbrella: '#2e7d32' },
    ],
    tagline: ['CHEAPER • LOUDER'],
    props: [
      { kind: 'drink-crate', at: [-5.2, 0.6], color: '#2e7d32' },
      { kind: 'drink-crate', at: [-5.2, 1.1], color: '#c62828' },
      { kind: 'drink-crate', at: [5.2, 0.3], color: '#f9a825' },
      { kind: 'bucket', at: [-1.6, 3.2], color: '#e53935' },
      { kind: 'bucket', at: [-1.1, 3.4], color: '#43a047' },
      { kind: 'cooler', at: [5.0, 3.3], rot: -30, color: '#e53935' },
      { kind: 'sign', at: [-1.9, 3.9], size: [1.7, 0.6], lines: ['EWA AGOYIN', 'TOMATO ₦300'], bg: '#fff8e1', fg: '#c62828', accent: '#2e7d32', style: 'poster' },
    ],
  },
  'balogun-market': {
    base: 'market',
    room: { floorColor: '#a39886' },
    stalls: [
      { goods: 'fabric', umbrella: '#1d4e89' },
      { goods: 'fabric', umbrella: '#c8287a' },
      { goods: 'shoes', umbrella: '#f6b90b' },
      { goods: 'fabric', umbrella: '#00897b' },
      { goods: 'fabric', umbrella: '#e2412e' },
    ],
    tagline: ['ANKARA • LACE • ASO-OKE'],
    props: [
      { kind: 'shelf', at: [-5.35, -0.3], rot: 90, size: [2.8, 1.8, 0.5], items: 'clothes', color: '#5d4037' },
      { kind: 'shelf', at: [5.35, 0.5], rot: -90, size: [2.8, 1.8, 0.5], items: 'clothes', color: '#5d4037' },
      { kind: 'clothesline', at: [0, 3.2], length: 7, height: 2.2, colors: ['#c8287a', '#f6b90b', '#1d4e89', '#00897b', '#e2412e', '#7b1fa2'] },
      { kind: 'sign', at: [4.2, -3.8], size: [1.6, 0.6], lines: ['HAGGLE OLYMPICS', 'NO FIXED PRICE'], bg: '#fff8e1', fg: '#1d4e89', accent: '#c8287a', style: 'poster' },
    ],
  },
  'ajah-market': {
    base: 'market',
    room: { floorColor: '#b39b74' },
    stalls: [
      { goods: 'peppers', umbrella: '#0f8a4f' },
      { goods: 'tomatoes', umbrella: '#f6b90b' },
      { goods: 'fabric', umbrella: '#00897b' },
      { goods: 'tomatoes', umbrella: '#e2412e' },
      { goods: 'peppers', umbrella: '#e65100' },
    ],
    tagline: ['FRESH • LEKKI-EPE ROAD'],
    props: [
      { kind: 'grill', at: [5.0, -0.4], rot: -90 },
      { kind: 'cooler', at: [5.2, 1.2], rot: -20, color: '#1e88e5' },
      { kind: 'canopy', at: [-4.8, 3.4], size: [2.6, 1.6], color: '#f9a825', trim: '#0e2733', height: 2.4 },
      { kind: 'drink-crate', at: [-5.3, 3.8], color: '#2e7d32' },
    ],
  },
  // --- Parks and open grounds -------------------------------------------------------------------------------------
  'freedom-park': {
    base: 'park',
    tagline: ['ART • HISTORY • LIVE MUSIC'],
    props: [
      // The old prison gate and walls the park grew out of.
      { kind: 'arch', at: [-0.4, -4.2], width: 4.2, height: 3.1, color: '#8d4b32', trim: '#d7b98a' },
      { kind: 'box', at: [-4.8, -4.2], size: [3.6, 1.1, 0.4], color: '#8d4b32', surface: 'stone', round: 0.04 },
      { kind: 'box', at: [4.0, -4.2], size: [3.0, 1.1, 0.4], color: '#8d4b32', surface: 'stone', round: 0.04 },
      // Sculptures.
      { kind: 'pillar', at: [-6.0, 3.8], height: 2.6, color: '#212121' },
      { kind: 'pillar', at: [2.2, 3.9], height: 2.0, color: '#b0471d' },
      { kind: 'planter', at: [0.0, 3.8], size: [1.4, 0.7] },
      { kind: 'flag', at: [3.6, -3.4] },
    ],
  },
  'national-stadium': {
    base: 'park',
    room: { floorColor: '#6aa640' },
    tagline: ['SURULERE • 1990s GLORY'],
    dropProps: ['canopy', 'stage', 'cooler'],
    dropModels: /^flower_/,
    dropRaisedNpcs: true,
    props: [
      // The running track round the pitch, flush with the grass.
      { kind: 'box', at: [0, -3.4], y: -0.005, size: [11.5, 0.03, 1.1], color: '#b5472f', surface: 'rubber', round: 0.01 },
      { kind: 'box', at: [0, 3.5], y: -0.005, size: [11.5, 0.03, 1.1], color: '#b5472f', surface: 'rubber', round: 0.01 },
      { kind: 'box', at: [-5.8, 0], y: -0.005, size: [1.1, 0.03, 6.4], color: '#b5472f', surface: 'rubber', round: 0.01 },
      { kind: 'box', at: [5.8, 0], y: -0.005, size: [1.1, 0.03, 6.4], color: '#b5472f', surface: 'rubber', round: 0.01 },
      // The stands, the goal, the floodlights.
      { kind: 'seat-row', at: [-1.8, -4.45], count: 7, color: '#2e7d32', frame: '#37474f' },
      { kind: 'seat-row', at: [3.0, -4.45], count: 5, color: '#ffffff', frame: '#37474f' },
      { kind: 'arch', at: [0, 2.6], width: 3.4, height: 2.2, color: '#ffffff' },
      { kind: 'pillar', at: [-6.6, -4.4], height: 5.5, color: '#90a4ae' },
      { kind: 'pillar', at: [6.6, -4.4], height: 5.5, color: '#90a4ae' },
      { kind: 'flag', at: [-4.2, -4.0] },
      { kind: 'flag', at: [4.6, -4.0] },
    ],
    player: { dance: { at: [-3.4, 3.0], rot: 30, animation: 'dance' } },
  },
  'lekki-conservation': {
    base: 'park',
    room: { floorColor: '#4f8a34' },
    tagline: ['CANOPY WALK • MIND THE MONKEYS'],
    dropProps: ['canopy', 'stage', 'cooler'],
    dropRaisedNpcs: true,
    props: [
      // The boardwalk (flush with the ground), and the rope bridge's sign.
      { kind: 'box', at: [0, -0.6], y: 0, size: [13, 0.04, 1.0], color: '#8d6e63', surface: 'wood', round: 0.01 },
      { kind: 'planter', at: [-4.4, 3.4], size: [1.6, 0.8] },
    ],
    furniture: [
      { model: 'tree_palmDetailedTall', at: [-6.4, -0.8], scale: 1.5 },
      { model: 'tree_palmDetailedTall', at: [6.2, -0.2], rot: 40, scale: 1.5 },
      { model: 'tree_palmBend', at: [-4.2, 4.0], rot: 80, scale: 1.4 },
      { model: 'tree_palmDetailedTall', at: [3.6, 4.2], rot: 120, scale: 1.4 },
      { model: 'plant_bushLarge', at: [-6.2, -2.6], scale: 1.8 },
      { model: 'plant_bushLarge', at: [6.0, -2.4], rot: 60, scale: 1.8 },
      { model: 'plant_bushDetailed', at: [1.8, 4.3], scale: 1.7 },
      { model: 'plant_bushDetailed', at: [-1.8, -4.3], rot: 30, scale: 1.7 },
    ],
    player: { dance: { at: [-3.4, 3.0], rot: 30, animation: 'dance' } },
  },
  // --- Beaches ---------------------------------------------------------------------------------------------------
  'tarkwa-bay': {
    base: 'beach',
    room: { floorColor: '#f3e6bf' },
    tagline: ['BOAT RIDE FROM VI • FRESH FISH'],
    dropProps: ['grill'],
    dropModels: /^speaker/,
    // A fishing boat pulled up on the sand.
    props: [
      { kind: 'box', at: [-5.2, -2.1], rot: 15, size: [3.4, 0.55, 1.1], color: '#6d4c41', surface: 'wood', round: 0.2 },
      { kind: 'box', at: [-5.2, -2.1], y: 0.55, rot: 15, size: [3.0, 0.08, 0.9], color: '#ffffff', surface: 'paint' },
    ],
    practicalColor: '#fff1c9',
  },
  // --- Clubs and lounges -----------------------------------------------------------------------------------------
  'the-vault': {
    base: 'club', sign: { fg: '#ff2fb1' }, practicalColor: '#ff7ad8', props: [{ kind: 'sign', at: [-3.4, -3.98], y: 2.55, wall: true, size: [1.9, 0.4], lines: ['BOTTLES • SPARKLERS'], bg: '#0b0710', fg: '#f6b90b', style: 'screen' }] },
  quilox: {
    base: 'club', sign: { fg: '#21d4fd' }, practicalColor: '#7ad8ff', props: [{ kind: 'sign', at: [-3.4, -3.98], y: 2.55, wall: true, size: [2.2, 0.4], lines: ['LED WALL • BOTTLE PARADE'], bg: '#0b0710', fg: '#21d4fd', style: 'screen' }] },
  'cubana-lagos': {
    base: 'club', sign: { fg: '#f6b90b' }, practicalColor: '#ffd27a', props: [{ kind: 'sign', at: [-3.4, -3.98], y: 2.55, wall: true, size: [2.2, 0.4], lines: ['OWAMBE AFTER MIDNIGHT'], bg: '#0b0710', fg: '#f6b90b', style: 'screen' }] },
  'club-57': {
    base: 'club', sign: { fg: '#ff6d00' }, practicalColor: '#ffb27a', props: [{ kind: 'sign', at: [-3.4, -3.98], y: 2.55, wall: true, size: [2.2, 0.4], lines: ['DETTY DECEMBER'], bg: '#0b0710', fg: '#ff6d00', style: 'screen' }] },
  'allen-nights': {
    base: 'club', sign: { fg: '#76ff03' }, practicalColor: '#b9ff7a', props: [{ kind: 'sign', at: [-3.4, -3.98], y: 2.55, wall: true, size: [2.2, 0.4], lines: ['MAINLAND TURN-UP'], bg: '#0b0710', fg: '#76ff03', style: 'screen' }] },
  'admiralty-nights': {
    base: 'club', sign: { fg: '#b388ff' }, practicalColor: '#caa8ff', props: [{ kind: 'sign', at: [-3.4, -3.98], y: 2.55, wall: true, size: [2.2, 0.4], lines: ['AMAPIANO FRIDAYS'], bg: '#0b0710', fg: '#b388ff', style: 'screen' }] },
  'new-afrika-shrine': {
    base: 'bar', tagline: ['LIVE AFROBEAT • FELA LIVES'], sign: { fg: '#f6b90b' } },
  'yaba-left-joint': {
    base: 'bar', tagline: ['PEPPER SOUP • FOOTBALL'], sign: { fg: '#ffb74d' } },
  'bourdillon-lounge': {
    base: 'bar', tagline: ['WINE • COCKTAILS • QUIET MONEY'], sign: { fg: '#e1bee7' } },
  'vi-lounge': {
    base: 'bar', tagline: ['AFTERWORK • SKYLINE'], sign: { fg: '#81d4fa' } },
  'lekki-rooftop': {
    base: 'bar', tagline: ['SUNSET • LAGOON • AFROBEATS'], sign: { fg: '#ff8a65' } },
  'ikeja-gra-lounge': {
    base: 'bar', tagline: ['SUYA • CHAPMAN • GIST'] },
};

// ---------------------------------------------------------------------------------------------------------------
// Dressing a template as a venue
// ---------------------------------------------------------------------------------------------------------------

const NATURAL_FLOORS: ReadonlySet<FloorStyle> = new Set<FloorStyle>(['sand', 'grass', 'asphalt', 'dark', 'cement', 'wood']);

/** Where a venue stands among those of its type (sorted by id), so their paint is spread evenly. */
function peersOf(venue: VenueDefinition): { readonly index: number; readonly count: number } {
  const peers = VENUES.filter((candidate) => candidate.type === venue.type).map((candidate) => candidate.id).sort();
  return { index: Math.max(0, peers.indexOf(venue.id)), count: peers.length };
}

const upper = (name: string): string => name.toUpperCase();

function dressSign(prop: Extract<PropSpec, { kind: 'sign' }>, venue: VenueDefinition, look: Look | undefined, index: number): PropSpec {
  const glow = prop.style === 'screen';
  const brand = BRANDS[index % BRANDS.length] as readonly [string, string];
  const [bg, fg] = glow ? [prop.bg, look?.sign?.fg ?? (NEON[index % NEON.length] as string)] : [look?.sign?.bg ?? brand[0], look?.sign?.fg ?? brand[1]];
  const rest = look?.tagline ?? prop.lines.slice(1);
  return { ...prop, bg, fg, lines: [upper(venue.name), ...rest] };
}

function build(base: InteriorTemplate, venue: VenueDefinition): InteriorTemplate {
  const authored = LOOKS[venue.id];
  const look = authored && authored.base === base.id ? authored : undefined;
  const { index, count } = peersOf(venue);
  const degrees = count > 1 ? (index * 360) / count + 20 : 0;
  const wall: WallSpec = look?.room?.wall ?? { ...base.room.wall, color: shiftHue(base.room.wall.color, degrees), band: base.room.wall.band ? shiftHue(base.room.wall.band, degrees) : undefined };
  const room: RoomSpec = {
    ...base.room,
    ...look?.room,
    wall,
    floorColor: look?.room?.floorColor ?? (NATURAL_FLOORS.has(base.room.floor) ? base.room.floorColor : shiftHue(base.room.floorColor, degrees)),
    curtain: base.room.curtain ? shiftHue(base.room.curtain, degrees * 1.7) : undefined,
  };

  let stalls = 0;
  const dropped = new Set(look?.dropProps ?? []);
  const props: PropSpec[] = [];
  for (const prop of base.props) {
    if (prop.kind === 'sign' && prop.venueName) {
      props.push(dressSign(prop, venue, look, index));
      continue;
    }
    if (dropped.has(prop.kind)) continue;
    if (prop.kind === 'stall' && look?.stalls) {
      const next = look.stalls[stalls++ % look.stalls.length];
      props.push(next ? { ...prop, goods: next.goods, umbrella: next.umbrella } : prop);
      continue;
    }
    props.push(prop);
  }
  const added = look?.props ?? [];
  const furniture = [...base.furniture.filter((piece) => !(look?.dropModels && look.dropModels.test(piece.model))), ...(look?.furniture ?? [])];
  const npcs = look?.dropRaisedNpcs ? base.npcs.filter((npc: NpcSpot) => npc.at.length !== 3 || npc.animation === 'sleep') : base.npcs;
  const player: PlayerSpots = { ...base.player, ...look?.player };

  return {
    ...base,
    label: venue.name,
    room,
    props: [...props, ...added],
    furniture,
    npcs,
    player,
    lighting: look?.practicalColor ? { ...base.lighting, practicalColor: look.practicalColor } : base.lighting,
  };
}

const CACHE = new Map<string, InteriorTemplate>();

/**
 * The template of a venue's type, dressed as that venue (its name on the boards, its own paint, any authored look).
 * Anything that isn't a known venue gets the template as it is.
 */
export function venueTemplate(base: InteriorTemplate, venueId: string | null | undefined): InteriorTemplate {
  const venue = venueId ? findVenue(venueId) : undefined;
  if (!venue || venue.type === 'home') return base;
  const key = `${base.id}|${venue.id}`;
  let template = CACHE.get(key);
  if (!template) {
    template = build(base, venue);
    CACHE.set(key, template);
  }
  return template;
}

/** The name boards of a template (the lines each venue shows as its own name). */
export function nameBoards(template: InteriorTemplate): string[] {
  return template.props.filter((prop): prop is Extract<PropSpec, { kind: 'sign' }> => prop.kind === 'sign' && prop.venueName === true).map((prop) => prop.lines[0] ?? '');
}
