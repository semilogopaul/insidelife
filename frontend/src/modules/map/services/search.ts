import {
  DISTRICTS,
  districtDistance,
  cityOfVenue,
  isVenueOpen,
  type CityId,
  type DistrictId,
  type VenueDefinition,
  type VenueType,
} from '@insidelife/shared';
import { CATEGORIES } from './categories';

/** Words a player might type for a kind of place (besides the type's own name and the category chip's label). */
const TYPE_TERMS: Readonly<Partial<Record<VenueType, readonly string[]>>> = {
  campus: ['university', 'uni', 'college', 'polytechnic', 'campus', 'school'],
  office: ['office', 'work', 'job', 'tech'],
  market: ['market', 'shop', 'shopping'],
  mall: ['mall', 'shop', 'shopping'],
  'hospital-public': ['hospital', 'clinic', 'doctor', 'medical', 'health'],
  'hospital-private': ['hospital', 'clinic', 'doctor', 'medical', 'health'],
  pharmacy: ['pharmacy', 'chemist', 'drugs', 'medicine'],
  gym: ['gym', 'fitness', 'workout'],
  bar: ['bar', 'lounge', 'drinks', 'pub'],
  club: ['club', 'nightclub', 'party'],
  buka: ['buka', 'food', 'restaurant', 'eat', 'canteen'],
  restaurant: ['restaurant', 'food', 'eat', 'dining'],
  beach: ['beach', 'sea', 'sand'],
  park: ['park', 'garden'],
  'cbt-centre': ['cbt', 'jamb', 'exam', 'waec'],
  airport: ['airport', 'flight', 'fly', 'plane'],
  'aviation-terminal': ['aviation', 'terminal', 'jet', 'hangar', 'flight', 'fly'],
  'motor-park': ['motor park', 'bus', 'station', 'park', 'travel'],
  'event-centre': ['event', 'centre', 'center', 'hall', 'wedding'],
  hotel: ['hotel', 'stay', 'lodge', 'room', 'sleep'],
  'estate-agency': ['estate', 'agent', 'agency', 'property', 'house', 'rent'],
  'car-dealer': ['car', 'cars', 'dealer', 'motors', 'auto'],
  church: ['church', 'worship', 'pray'],
  mosque: ['mosque', 'worship', 'pray'],
  cinema: ['cinema', 'movies', 'film'],
  salon: ['salon', 'barber', 'hair', 'braids'],
  government: ['government', 'ministry', 'secretariat', 'civil'],
  school: ['school', 'nursery', 'primary', 'secondary'],
  mansion: ['mansion', 'landmark'],
  'private-jet': ['private jet', 'jet', 'landmark'],
  refinery: ['refinery', 'oil', 'landmark'],
  stadium: ['stadium', 'football', 'sport'],
};

/** Lower-case, accent-free, punctuation-free ("Ìkéjà City-Mall!" -> "ikeja city mall"). */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const words = (text: string): string[] => normalizeText(text).split(' ').filter(Boolean);

/** Edit distance with transpositions, capped (returns cap + 1 beyond it). */
export function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i += 1) {
    rows.push(new Array<number>(b.length + 1).fill(0));
    rows[i]![0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
}

/** How many typos a word of this length may carry: none for short words, one for 4-6 letters, two beyond. */
const typoBudget = (length: number): number => (length >= 8 ? 2 : length >= 4 ? 1 : 0);

/** Score tiers: higher ranks first. */
export const SCORE = {
  exact: 100,
  prefix: 90,
  nameWord: 75,
  id: 70,
  nameContains: 65,
  category: 50,
  district: 45,
  typo: 35,
  blurb: 30,
} as const;

export interface SearchResult {
  readonly venue: VenueDefinition;
  readonly score: number;
  readonly cityId: CityId;
}

interface Indexed {
  readonly venue: VenueDefinition;
  readonly name: string;
  readonly nameWords: string[];
  readonly idWords: string[];
  readonly categoryWords: string[];
  readonly districtWords: string[];
  readonly blurbWords: string[];
}

const indexCache = new WeakMap<VenueDefinition, Indexed>();

function indexOf(venue: VenueDefinition): Indexed {
  const cached = indexCache.get(venue);
  if (cached) return cached;
  const chip = CATEGORIES.find((category) => category.types.includes(venue.type));
  const terms = [
    ...(TYPE_TERMS[venue.type] ?? []),
    venue.type.replace(/-/g, ' '),
    ...(chip && chip.label !== 'Must see' ? [chip.label] : []),
  ];
  const entry: Indexed = {
    venue,
    name: normalizeText(venue.name),
    nameWords: words(venue.name),
    idWords: venue.id.split('-'),
    categoryWords: [...new Set(terms.flatMap(words))],
    districtWords: words(DISTRICTS[venue.districtId].name),
    blurbWords: words(venue.blurb),
  };
  indexCache.set(venue, entry);
  return entry;
}

/** The best score of one query word against a venue (0 = no match). */
function tokenScore(token: string, entry: Indexed): number {
  if (entry.nameWords.includes(token) || entry.idWords.includes(token))
    return entry.name.startsWith(token) ? SCORE.prefix - 5 : SCORE.nameWord + 5;
  if (entry.nameWords.some((word) => word.startsWith(token)))
    return entry.name.startsWith(token) ? SCORE.prefix - 10 : SCORE.nameWord;
  if (entry.idWords.some((word) => word.startsWith(token))) return SCORE.id;
  if (token.length >= 3 && entry.name.includes(token)) return SCORE.nameContains;
  if (entry.categoryWords.some((word) => word === token || (token.length >= 3 && word.startsWith(token))))
    return SCORE.category;
  if (entry.districtWords.some((word) => word.startsWith(token))) return SCORE.district;
  // Simple typo tolerance against names, categories and districts.
  const budget = typoBudget(token.length);
  if (budget > 0) {
    const pools = [entry.nameWords, entry.categoryWords, entry.districtWords];
    for (const pool of pools)
      for (const word of pool) {
        const head = word.length > token.length + budget ? word.slice(0, token.length) : word;
        if (editDistance(token, head, budget) <= budget) return SCORE.typo;
      }
  }
  if (entry.blurbWords.some((word) => word === token || (token.length >= 3 && word.startsWith(token))))
    return SCORE.blurb;
  return 0;
}

/** How well a venue matches a typed query; 0 when it doesn't (every word must match something). */
export function scoreVenue(query: string, venue: VenueDefinition): number {
  const whole = normalizeText(query);
  if (!whole) return 0;
  const entry = indexOf(venue);
  if (entry.name === whole) return SCORE.exact;
  if (entry.name.startsWith(whole)) return SCORE.prefix;
  let lowest = Number.POSITIVE_INFINITY;
  for (const token of whole.split(' ')) {
    const score = tokenScore(token, entry);
    if (score === 0) return 0;
    lowest = Math.min(lowest, score);
  }
  return lowest;
}

export interface SearchContext {
  /** Where you are: the district distances are measured from. */
  readonly fromDistrict: DistrictId;
  readonly cityId: CityId;
  /** Restrict to these venue types (the category chip); omit for everything. */
  readonly types?: readonly VenueType[];
}

export interface SearchGroups {
  readonly here: readonly SearchResult[];
  readonly elsewhere: readonly SearchResult[];
}

const kmTo = (from: DistrictId, venue: VenueDefinition): number => districtDistance(from, venue.districtId);

/** Ranked matches for a query, your city first and the other city apart; nearer first among equals. */
export function searchVenues(
  query: string,
  venues: readonly VenueDefinition[],
  context: SearchContext,
): SearchGroups {
  const scored: SearchResult[] = [];
  for (const venue of venues) {
    if (context.types && !context.types.includes(venue.type)) continue;
    const score = scoreVenue(query, venue);
    if (score > 0) scored.push({ venue, score, cityId: cityOfVenue(venue) });
  }
  const here = scored.filter((result) => result.cityId === context.cityId);
  const rank = (a: SearchResult, b: SearchResult): number =>
    b.score - a.score ||
    kmTo(context.fromDistrict, a.venue) - kmTo(context.fromDistrict, b.venue) ||
    a.venue.name.localeCompare(b.venue.name);
  return {
    here: here.sort(rank),
    elsewhere: scored
      .filter((result) => result.cityId !== context.cityId)
      .sort((a, b) => b.score - a.score || a.venue.name.localeCompare(b.venue.name)),
  };
}

/** "Nearby" in the same district, otherwise "3.4 km away". */
export function distanceLabel(from: DistrictId, venue: VenueDefinition): string {
  if (from === venue.districtId) return 'Nearby';
  const km = kmTo(from, venue);
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
}

/** "Closed now · opens 8 AM" for a shut venue, null when it's open (or always open). */
export function closedNote(
  venue: VenueDefinition,
  hour: number,
  formatHour: (hour: number) => string,
): string | null {
  if (!venue.hours || isVenueOpen(venue, hour)) return null;
  return `Closed now · opens ${formatHour(venue.hours[0])}`;
}

/** Suggestions for the empty search: a few words that find something. */
export const SEARCH_SUGGESTIONS: readonly string[] = ['hospital', 'hotel', 'suya', 'UNILAG', 'Eko', 'market'];
