import { venueLot, type LotArchetype, type VenueDefinition, type VenueType } from '@insidelife/shared';
import type { PictogramName } from './pictograms';

/**
 * What a place is, as players see it on the minimap, in the Map app and on place headers: one pictogram on one colour
 * per kind, so a market looks the same everywhere. Colours group by what you go there for (learning is purple, health
 * red, worship and government green…) and all carry a white pictogram at ≥ 4.5:1, except the two Danfo-yellow kinds,
 * which carry ink.
 */
export const PLACE_KINDS = [
  'airport',
  'university',
  'school',
  'exam-centre',
  'market',
  'mall',
  'shop',
  'salon',
  'food',
  'bar',
  'club',
  'cinema',
  'gym',
  'event-centre',
  'hotel',
  'hospital',
  'pharmacy',
  'office',
  'office-tower',
  'government',
  'stadium',
  'park',
  'beach',
  'mosque',
  'church',
  'motor-park',
  'car-dealer',
  'fuel-station',
  'mechanic',
  'estate-agency',
  'home',
  'house',
  'land',
  'building-site',
  'mansion',
  'private-jet',
  'refinery',
] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export interface PlaceStyle {
  /** What the pictogram depicts, for screen readers ("Market"). */
  readonly label: string;
  readonly pictogram: PictogramName;
  /** Disc colour. */
  readonly color: string;
  /** Pictogram colour on the disc. */
  readonly ink: string;
}

const WHITE = '#ffffff';
const INK = '#0e2733';

export const PLACE_STYLES: Readonly<Record<PlaceKind, PlaceStyle>> = {
  airport: { label: 'Airport', pictogram: 'plane', color: '#13606b', ink: WHITE },
  university: { label: 'University', pictogram: 'gradCap', color: '#6a3cb0', ink: WHITE },
  school: { label: 'School', pictogram: 'schoolHouse', color: '#6a3cb0', ink: WHITE },
  'exam-centre': { label: 'CBT centre', pictogram: 'examCentre', color: '#6a3cb0', ink: WHITE },
  market: { label: 'Market', pictogram: 'marketStall', color: '#b8480f', ink: WHITE },
  mall: { label: 'Mall', pictogram: 'shoppingBag', color: '#b8226e', ink: WHITE },
  shop: { label: 'Shop', pictogram: 'storefront', color: '#b8480f', ink: WHITE },
  salon: { label: 'Salon', pictogram: 'scissors', color: '#b8226e', ink: WHITE },
  food: { label: 'Food', pictogram: 'forkKnife', color: '#c2410c', ink: WHITE },
  bar: { label: 'Lounge', pictogram: 'cocktail', color: '#7e2fa8', ink: WHITE },
  club: { label: 'Club', pictogram: 'musicNotes', color: '#7e2fa8', ink: WHITE },
  cinema: { label: 'Cinema', pictogram: 'clapper', color: '#a3263f', ink: WHITE },
  gym: { label: 'Gym', pictogram: 'dumbbell', color: '#3d4d6e', ink: WHITE },
  'event-centre': { label: 'Event centre', pictogram: 'balloons', color: '#b8226e', ink: WHITE },
  hotel: { label: 'Hotel', pictogram: 'bed', color: '#7a4a1c', ink: WHITE },
  hospital: { label: 'Hospital', pictogram: 'cross', color: '#c62828', ink: WHITE },
  pharmacy: { label: 'Pharmacy', pictogram: 'capsule', color: '#0f7a45', ink: WHITE },
  office: { label: 'Office', pictogram: 'officeBlock', color: '#2457d6', ink: WHITE },
  'office-tower': { label: 'Business district', pictogram: 'towers', color: '#1e3f9e', ink: WHITE },
  government: { label: 'Government', pictogram: 'columns', color: '#11683a', ink: WHITE },
  stadium: { label: 'Stadium', pictogram: 'football', color: '#2e6b2a', ink: WHITE },
  park: { label: 'Park', pictogram: 'tree', color: '#2e6b2a', ink: WHITE },
  beach: { label: 'Beach', pictogram: 'beach', color: '#0b6f8c', ink: WHITE },
  mosque: { label: 'Mosque', pictogram: 'mosque', color: '#11683a', ink: WHITE },
  church: { label: 'Church', pictogram: 'church', color: '#2b3f8f', ink: WHITE },
  'motor-park': { label: 'Motor park', pictogram: 'bus', color: '#f6b90b', ink: INK },
  'car-dealer': { label: 'Car dealer', pictogram: 'car', color: '#13606b', ink: WHITE },
  'fuel-station': { label: 'Filling station', pictogram: 'fuelPump', color: '#16804a', ink: WHITE },
  mechanic: { label: 'Mechanic', pictogram: 'wrench', color: '#b3261e', ink: WHITE },
  'estate-agency': { label: 'Estate agent', pictogram: 'key', color: '#7a4a1c', ink: WHITE },
  home: { label: 'Your home', pictogram: 'house', color: '#f6b90b', ink: INK },
  house: { label: 'Your house', pictogram: 'house', color: '#0f7a45', ink: WHITE },
  land: { label: 'Your land', pictogram: 'land', color: '#0f7a45', ink: WHITE },
  'building-site': { label: 'Building site', pictogram: 'hardHat', color: '#0f7a45', ink: WHITE },
  mansion: { label: 'Mansion', pictogram: 'villa', color: '#8a6a12', ink: WHITE },
  'private-jet': { label: 'Private jet', pictogram: 'jet', color: '#1f1f1f', ink: '#e8c35a' },
  refinery: { label: 'Refinery', pictogram: 'refinery', color: '#1d4f91', ink: WHITE },
};

const BY_VENUE_TYPE: Readonly<Record<VenueType, PlaceKind>> = {
  home: 'home',
  campus: 'university',
  office: 'office',
  market: 'market',
  mall: 'mall',
  'hospital-public': 'hospital',
  'hospital-private': 'hospital',
  pharmacy: 'pharmacy',
  gym: 'gym',
  bar: 'bar',
  club: 'club',
  buka: 'food',
  restaurant: 'food',
  beach: 'beach',
  park: 'park',
  'cbt-centre': 'exam-centre',
  airport: 'airport',
  'motor-park': 'motor-park',
  'event-centre': 'event-centre',
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

const BY_ARCHETYPE: Readonly<Record<LotArchetype, PlaceKind>> = {
  airport: 'airport',
  campus: 'university',
  market: 'market',
  mall: 'mall',
  hospital: 'hospital',
  'office-tower': 'office-tower',
  office: 'office',
  government: 'government',
  stadium: 'stadium',
  park: 'park',
  beach: 'beach',
  hotel: 'hotel',
  club: 'club',
  mosque: 'mosque',
  church: 'church',
  'motor-park': 'motor-park',
  'car-dealer': 'car-dealer',
  shop: 'shop',
  school: 'school',
  mansion: 'mansion',
  'jet-pad': 'private-jet',
  refinery: 'refinery',
};

/** Buildings that say more than their venue type: the National Stadium is a "park" venue, Eko Hotel an event centre. */
const LANDMARK_ARCHETYPES: ReadonlySet<LotArchetype> = new Set(['stadium', 'hotel', 'office-tower']);

export const placeKindOfVenueType = (type: VenueType): PlaceKind => BY_VENUE_TYPE[type];

export const placeKindOfArchetype = (archetype: LotArchetype): PlaceKind => BY_ARCHETYPE[archetype];

/** The kind of a catalog venue: its type, unless its building on the map is a landmark (stadium, hotel, towers). */
export function venuePlaceKind(venue: Pick<VenueDefinition, 'id' | 'type'>): PlaceKind {
  const archetype = venueLot(venue.id)?.archetype;
  return archetype && LANDMARK_ARCHETYPES.has(archetype)
    ? BY_ARCHETYPE[archetype]
    : BY_VENUE_TYPE[venue.type];
}

/** Your own property: home where you live, otherwise what stands on the plot. */
export function propertyPlaceKind(property: {
  readonly stage: 'land' | 'construction' | 'built';
  readonly livedIn: boolean;
}): PlaceKind {
  if (property.livedIn) return 'home';
  return property.stage === 'land' ? 'land' : property.stage === 'construction' ? 'building-site' : 'house';
}
