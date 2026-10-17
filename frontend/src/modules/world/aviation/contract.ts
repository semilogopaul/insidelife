/**
 * LOCAL MIRROR of the aviation contract in docs/MULTI_CITY.md (aircraft ids and classes, airport venue ids, livery).
 *
 * The shared aircraft catalog (`aircraft.ts`) and the `aviation-terminal` venue type are added by the aircraft-ownership
 * and multi-city workstreams. Until they land on this branch, the 3D side keeps these ids and types here. When merged,
 * replace the bodies of this file with re-exports from `@insidelife/shared` (names are chosen to match the contract) and
 * delete the duplicates; nothing else in `modules/world/aviation` needs to change.
 */

export const AIRCRAFT_CLASSES = ['piston-single', 'piston-twin', 'turboprop', 'light-jet', 'midsize-jet', 'long-range-jet', 'airliner-jet'] as const;
export type AircraftClass = (typeof AIRCRAFT_CLASSES)[number];

export const AIRCRAFT_IDS = ['cessna-172', 'piper-seneca', 'king-air-350', 'pilatus-pc12', 'phenom-300e', 'challenger-350', 'gulfstream-g650', 'boeing-bbj'] as const;
export type AircraftId = (typeof AIRCRAFT_IDS)[number];

export const AIRCRAFT_CLASS_OF: Readonly<Record<AircraftId, AircraftClass>> = {
  'cessna-172': 'piston-single',
  'piper-seneca': 'piston-twin',
  'king-air-350': 'turboprop',
  'pilatus-pc12': 'turboprop',
  'phenom-300e': 'light-jet',
  'challenger-350': 'midsize-jet',
  'gulfstream-g650': 'long-range-jet',
  'boeing-bbj': 'airliner-jet',
};

/** General Aviation Terminal venue ids (Lagos, Abuja) and the venue type their interior belongs to. */
export const GAT_VENUE_IDS = ['mmia-gat', 'naia-gat'] as const;
export const AVIATION_TERMINAL_TYPE = 'aviation-terminal';

/** Painted name: at most this many characters. */
export const AIRCRAFT_NAME_MAX = 16;

/** How a plane looks: two colours, the name painted on the fuselage and the Nigerian registration `5N-XXX`. */
export interface AircraftLivery {
  /** Fuselage and wings, `#rrggbb`. */
  readonly base: string;
  /** Cheatline, tail, engine bands and wing tips, `#rrggbb`. */
  readonly accent: string;
  /** e.g. "AIR TOLU" (at most 16 chars; the server moderates it). Empty paints no name. */
  readonly name: string;
  /** `5N-XXX`. */
  readonly registration: string;
}

export const REGISTRATION_PATTERN = /^5N-[A-Z]{3}$/;
export const isRegistration = (value: string): boolean => REGISTRATION_PATTERN.test(value);

export const isJetClass = (cls: AircraftClass): boolean => cls === 'light-jet' || cls === 'midsize-jet' || cls === 'long-range-jet' || cls === 'airliner-jet';

/** A neutral white-and-green (Nigerian colours) livery for previews and for when a plane has none yet. */
export const DEFAULT_LIVERY: AircraftLivery = { base: '#f4f2ec', accent: '#0a7d3c', name: '', registration: '5N-INL' };
