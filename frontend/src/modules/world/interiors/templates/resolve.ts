import { findVenue, isHomeLocation, type CharacterSummaryDto, type VenueType } from '@insidelife/shared';

export const INTERIOR_TEMPLATE_IDS = [
  'home-family',
  'home-face-me',
  'home-self-contain',
  'home-flat',
  'home-duplex',
  'home-mansion',
  'home-hostel',
  'campus',
  'school',
  'office',
  'hospital-ward',
  'clinic',
  'pharmacy',
  'club',
  'buka',
  'restaurant',
  'bar',
  'market',
  'mall',
  'gym',
  'cinema',
  'church',
  'mosque',
  'cbt-centre',
  'government',
  'estate-agency',
  'car-dealer',
  'salon',
  'airport',
  'event-centre',
  'hotel',
  'beach',
  'park',
  'motor-park',
  'mansion',
  'private-jet',
  'refinery',
  // Aviation (docs/MULTI_CITY.md): the General Aviation Terminal and the walkable cabin of each aircraft class.
  'aviation-terminal',
  'aircraft-piston-single',
  'aircraft-piston-twin',
  'aircraft-turboprop',
  'aircraft-light-jet',
  'aircraft-midsize-jet',
  'aircraft-long-range-jet',
  'aircraft-airliner-jet',
] as const;
export type InteriorTemplateId = (typeof INTERIOR_TEMPLATE_IDS)[number];

export type HomeInfo = Pick<CharacterSummaryDto['home'], 'label' | 'ownership' | 'comfort'>;

/** Each venue type's interior. Partial on purpose: a newly added type falls back to `genericTemplateFor` until it gets one. */
const VENUE_TEMPLATES: Readonly<Partial<Record<Exclude<VenueType, 'home'>, InteriorTemplateId>>> = {
  campus: 'campus',
  office: 'office',
  market: 'market',
  mall: 'mall',
  'hospital-public': 'hospital-ward',
  'hospital-private': 'clinic',
  pharmacy: 'pharmacy',
  gym: 'gym',
  bar: 'bar',
  club: 'club',
  buka: 'buka',
  restaurant: 'restaurant',
  beach: 'beach',
  park: 'park',
  // The open ground dressed as a stadium (track, stands, floodlights) by its venue look.
  stadium: 'park',
  'cbt-centre': 'cbt-centre',
  'aviation-terminal': 'aviation-terminal',
  airport: 'airport',
  'motor-park': 'motor-park',
  'event-centre': 'event-centre',
  hotel: 'hotel',
  'estate-agency': 'estate-agency',
  'car-dealer': 'car-dealer',
  church: 'church',
  mosque: 'mosque',
  cinema: 'cinema',
  salon: 'salon',
  government: 'government',
  school: 'school',
  mansion: 'mansion',
  'private-jet': 'private-jet',
  refinery: 'refinery',
};

/** A sensible walkable room for a venue type without its own interior yet (by what its name suggests). */
export function genericTemplateFor(type: string): InteriorTemplateId {
  if (/club|disco/.test(type)) return 'club';
  if (/bar|lounge|pub|shrine/.test(type)) return 'bar';
  if (/beach|pool|resort/.test(type)) return 'beach';
  if (/park|garden|zoo/.test(type)) return 'park';
  if (/hospital|clinic|health|lab/.test(type)) return 'clinic';
  if (/pharm|chemist/.test(type)) return 'pharmacy';
  if (/church|cathedral/.test(type)) return 'church';
  if (/mosque/.test(type)) return 'mosque';
  if (/school|college|campus|university|library/.test(type)) return 'school';
  if (/restaurant|eatery|cafe|food|kitchen/.test(type)) return 'restaurant';
  if (/buka|canteen/.test(type)) return 'buka';
  if (/gym|fitness|sport|stadium/.test(type)) return 'gym';
  if (/salon|barb|spa/.test(type)) return 'salon';
  if (/market/.test(type)) return 'market';
  if (/mall|shop|store|boutique/.test(type)) return 'mall';
  if (/hall|event|party/.test(type)) return 'event-centre';
  if (/car|motor|auto/.test(type)) return 'car-dealer';
  return 'office';
}

/** The venue type a (venue) template is the interior of, or null for homes and dev templates. */
export function venueTypeFor(templateId: string): Exclude<VenueType, 'home'> | null {
  const entry = Object.entries(VENUE_TEMPLATES).find(([, template]) => template === templateId);
  return entry ? (entry[0] as Exclude<VenueType, 'home'>) : null;
}

/** Which home interior fits the player's current home (label keywords first, comfort as a fallback). */
export function homeTemplateFor(home: HomeInfo | null | undefined): InteriorTemplateId {
  if (!home) return 'home-family';
  if (home.ownership === 'hostel') return 'home-hostel';
  const label = home.label.toLowerCase();
  if (/face-me|face me/.test(label)) return 'home-face-me';
  if (/self[- ]contain/.test(label)) return 'home-self-contain';
  if (/mansion|banana island/.test(label)) return 'home-mansion';
  if (/duplex/.test(label)) return 'home-duplex';
  if (/family house/.test(label)) return 'home-family';
  if (/flat|bungalow|bed/.test(label)) return 'home-flat';
  if (home.comfort >= 12) return 'home-mansion';
  if (home.comfort >= 9) return 'home-duplex';
  if (home.comfort >= 5) return 'home-flat';
  if (home.comfort >= 3) return 'home-self-contain';
  return home.comfort <= 0 ? 'home-face-me' : 'home-family';
}

/** Template for a location id: venue type via the catalog, or the player's home for `home:<id>`. */
export function resolveTemplateId(locationId: string, home?: HomeInfo | null): InteriorTemplateId {
  if (isHomeLocation(locationId)) return homeTemplateFor(home);
  const venue = findVenue(locationId);
  if (!venue) return (INTERIOR_TEMPLATE_IDS as readonly string[]).includes(locationId) ? (locationId as InteriorTemplateId) : 'home-family';
  if (venue.type === 'home') return homeTemplateFor(home);
  return VENUE_TEMPLATES[venue.type] ?? genericTemplateFor(venue.type);
}

/** NEPA (power) cut: deterministic per location and game day, only at night. */
export function isNepaOff(locationId: string, dayIndex: number, hour: number, chance = 0.35): boolean {
  if (hour >= 6 && hour < 19) return false;
  let h = 2166136261;
  const key = `${locationId}:${dayIndex}`;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000 < chance;
}
