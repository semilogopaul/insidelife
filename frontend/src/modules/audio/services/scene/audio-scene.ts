import {
  findVenue,
  isHomeLocation,
  streetDistrict,
  toDateParts,
  type DistrictId,
  type GameMinute,
  type VenueType,
} from '@insidelife/shared';
import { sceneHour } from '@/common/game/daylight';
import type { PlayerMode } from '@/common/game/world-store';
import type { MusicContext } from '../../types/audio';
import { isNightHour, type PlaceType, type SceneKind } from '../ambience/ambience-state';

/**
 * Where the player is, as far as audio cares: indoors/outdoors, which kind of place, which district, day or night,
 * and which music context. Pure: derived from the world store, the snapshot and the game clock.
 */

/** Every venue type's music. Places of worship and hospitals are "hospital" = no music, just the room. */
const VENUE_CONTEXT: Readonly<Record<VenueType, MusicContext>> = {
  home: 'home',
  campus: 'campus',
  school: 'campus',
  'cbt-centre': 'campus',
  office: 'office',
  government: 'office',
  'estate-agency': 'office',
  'car-dealer': 'office',
  'hospital-public': 'hospital',
  'hospital-private': 'hospital',
  pharmacy: 'hospital',
  church: 'hospital',
  mosque: 'hospital',
  club: 'club',
  bar: 'club',
  'event-centre': 'party',
  hotel: 'party',
  beach: 'party',
  market: 'city',
  mall: 'city',
  buka: 'city',
  restaurant: 'city',
  park: 'city',
  stadium: 'city',
  'motor-park': 'city',
  airport: 'city',
  'aviation-terminal': 'city',
  gym: 'city',
  salon: 'city',
  cinema: 'city',
  mansion: 'party',
  'private-jet': 'home',
  refinery: 'office',
};

const ENERGY: Partial<Record<PlaceType, number>> = { club: 1, bar: 0.65, 'event-centre': 1, beach: 0.8 };

/** Venue types whose paid rotation (Club DJ) plays inside. */
const ROTATION_VENUES: ReadonlySet<VenueType> = new Set(['club', 'bar']);

export interface SceneInputs {
  readonly mode: PlayerMode;
  /** Snapshot location (`venueId`, `home:<id>`, `street:<district>`), null before the snapshot arrives. */
  readonly locationId: string | null;
  readonly homeDistrictId: DistrictId | null;
  /** District under the player's feet in the open world. */
  readonly positionDistrictId: DistrictId | null;
  readonly gameMinute: GameMinute;
  /** Sound the morning the world is drawn in (`common/game/daylight`), not the game hour. */
  readonly alwaysDaylight?: boolean;
}

/** A `music-context` event from another feature; valid until the player moves somewhere else (`key` changes). */
export interface MusicOverride {
  readonly context: MusicContext;
  readonly venueId: string | null;
  readonly key: string;
}

export interface AudioScene {
  readonly kind: SceneKind;
  readonly context: MusicContext;
  /** 0-1 music energy. */
  readonly energy: number;
  readonly night: boolean;
  readonly placeType: PlaceType | null;
  readonly districtId: DistrictId | null;
  /** Club/bar whose paid rotation to interleave. */
  readonly clubVenueId: string | null;
  readonly driving: boolean;
}

const OUTDOOR_MODES: ReadonlySet<PlayerMode> = new Set(['walking', 'driving', 'riding']);

/** Identity of "where the player is" — overrides reset when it changes. */
export function sceneKey(inputs: Pick<SceneInputs, 'mode' | 'locationId'>): string {
  return `${OUTDOOR_MODES.has(inputs.mode) ? 'outside' : inputs.mode}|${inputs.locationId ?? '-'}`;
}

export function resolveScene(inputs: SceneInputs, override: MusicOverride | null = null): AudioScene {
  const night = isNightHour(sceneHour(toDateParts(inputs.gameMinute).hour, inputs.alwaysDaylight ?? false));
  const driving = inputs.mode === 'driving' || inputs.mode === 'riding';
  const base = resolvePlace(inputs);
  const scene: AudioScene = { ...base, night, driving };
  if (!override || override.key !== sceneKey(inputs)) return scene;
  if (override.context === 'menu') return { ...scene, kind: 'menu', context: 'menu', clubVenueId: null };
  const venue = override.venueId ? findVenue(override.venueId) : undefined;
  return {
    ...scene,
    context: override.context,
    energy: override.context === 'club' || override.context === 'party' ? Math.max(scene.energy, 0.9) : scene.energy,
    clubVenueId: override.context === 'club' ? (venue && ROTATION_VENUES.has(venue.type) ? venue.id : (override.venueId ?? scene.clubVenueId)) : null,
  };
}

function resolvePlace(inputs: SceneInputs): Omit<AudioScene, 'night' | 'driving'> {
  const street = (districtId: DistrictId | null): Omit<AudioScene, 'night' | 'driving'> => ({
    kind: 'street',
    context: 'city',
    energy: 0.6,
    placeType: null,
    districtId,
    clubVenueId: null,
  });
  const { locationId } = inputs;

  if (OUTDOOR_MODES.has(inputs.mode)) {
    return street(inputs.positionDistrictId ?? (locationId ? streetDistrict(locationId) : null) ?? inputs.homeDistrictId);
  }
  if (!locationId) {
    // No character yet (landing, loading before the snapshot): the signature theme.
    return { kind: 'menu', context: 'menu', energy: 0.6, placeType: null, districtId: null, clubVenueId: null };
  }
  if (isHomeLocation(locationId)) {
    return { kind: 'inside', context: 'home', energy: 0.4, placeType: 'home', districtId: inputs.homeDistrictId, clubVenueId: null };
  }
  const streetId = streetDistrict(locationId);
  if (streetId) return street(streetId);
  const venue = findVenue(locationId);
  if (!venue) return street(inputs.positionDistrictId ?? inputs.homeDistrictId);
  return {
    kind: 'inside',
    context: VENUE_CONTEXT[venue.type],
    energy: ENERGY[venue.type] ?? 0.6,
    placeType: venue.type,
    districtId: venue.districtId,
    clubVenueId: ROTATION_VENUES.has(venue.type) ? venue.id : null,
  };
}
