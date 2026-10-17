import type { AircraftClass } from '../contract';

/**
 * What each class looks like, in real metres (nose at +Z, up +Y, the left side is +X, origin on the ground under the
 * middle of the fuselage). Pure data: `build-aircraft.ts` turns it into geometry and the tests pin that the classes
 * really differ (length, span, engines, tail, windows).
 */

export type EngineKind =
  /** One propeller on the nose. */
  | 'prop-nose'
  /** A propeller on each wing. */
  | 'prop-wing'
  /** Turbofans on pylons at the rear of the fuselage. */
  | 'jet-rear'
  /** Turbofans slung under the wings. */
  | 'jet-under';

export interface AircraftSpec {
  readonly cls: AircraftClass;
  readonly length: number;
  readonly span: number;
  /** Fuselage cross-section (full width and height). */
  readonly fuselage: { readonly w: number; readonly h: number };
  /** Wheel/belly clearance. */
  readonly clearance: number;
  readonly engine: { readonly kind: EngineKind; readonly count: 1 | 2; readonly radius: number };
  readonly wing: {
    /** High wings sit on top of the fuselage (Cessna), low wings under the cabin. */
    readonly position: 'high' | 'low';
    readonly rootChord: number;
    readonly tipChord: number;
    /** Leading-edge sweep back at the tip, metres. */
    readonly sweep: number;
    /** Leading edge at the root, as a fraction of the length from the middle (+ towards the nose). */
    readonly z: number;
    readonly winglets: boolean;
  };
  readonly tail: {
    readonly tType: boolean;
    /** Fin height above the fuselage top. */
    readonly finHeight: number;
    readonly stabSpan: number;
  };
  /** Cabin windows per side: how many, their width, and where the row is centred along the length. */
  readonly windows: { readonly count: number; readonly size: number; readonly centre: number };
  /** Door on the left side, along the length from the middle (negative = aft). */
  readonly doorZ: number;
  readonly airstair: boolean;
  /** Passenger seats in the walkable cabin (`cabin/cabin-layouts.ts`). */
  readonly seats: number;
}

export const AIRCRAFT_SPECS: Readonly<Record<AircraftClass, AircraftSpec>> = {
  'piston-single': {
    cls: 'piston-single',
    length: 8.3,
    span: 11.0,
    fuselage: { w: 1.15, h: 1.45 },
    clearance: 0.5,
    engine: { kind: 'prop-nose', count: 1, radius: 0.95 },
    wing: { position: 'high', rootChord: 1.6, tipChord: 1.1, sweep: 0.1, z: 0.06, winglets: false },
    tail: { tType: false, finHeight: 1.0, stabSpan: 3.4 },
    windows: { count: 3, size: 0.34, centre: -1.0 },
    doorZ: 0.6,
    airstair: false,
    seats: 4,
  },
  'piston-twin': {
    cls: 'piston-twin',
    length: 8.7,
    span: 11.8,
    fuselage: { w: 1.2, h: 1.35 },
    clearance: 0.6,
    engine: { kind: 'prop-wing', count: 2, radius: 0.85 },
    wing: { position: 'low', rootChord: 1.7, tipChord: 1.1, sweep: 0.2, z: 0.0, winglets: false },
    tail: { tType: true, finHeight: 1.45, stabSpan: 3.6 },
    windows: { count: 4, size: 0.32, centre: 0.7 },
    doorZ: -1.7,
    airstair: false,
    seats: 6,
  },
  turboprop: {
    cls: 'turboprop',
    length: 14.4,
    span: 17.7,
    fuselage: { w: 1.75, h: 1.95 },
    clearance: 0.9,
    engine: { kind: 'prop-wing', count: 2, radius: 1.25 },
    wing: { position: 'low', rootChord: 2.3, tipChord: 1.2, sweep: 0.5, z: 0.0, winglets: false },
    tail: { tType: true, finHeight: 2.1, stabSpan: 5.6 },
    windows: { count: 6, size: 0.4, centre: 1.0 },
    doorZ: -2.6,
    airstair: true,
    seats: 9,
  },
  'light-jet': {
    cls: 'light-jet',
    length: 15.9,
    span: 16.2,
    fuselage: { w: 1.95, h: 2.05 },
    clearance: 0.9,
    engine: { kind: 'jet-rear', count: 2, radius: 0.5 },
    wing: { position: 'low', rootChord: 2.6, tipChord: 1.1, sweep: 1.7, z: 0.08, winglets: false },
    tail: { tType: true, finHeight: 2.0, stabSpan: 5.4 },
    windows: { count: 5, size: 0.4, centre: 1.2 },
    doorZ: -3.0,
    airstair: true,
    seats: 7,
  },
  'midsize-jet': {
    cls: 'midsize-jet',
    length: 20.9,
    span: 19.5,
    fuselage: { w: 2.2, h: 2.15 },
    clearance: 1.0,
    engine: { kind: 'jet-rear', count: 2, radius: 0.6 },
    wing: { position: 'low', rootChord: 3.4, tipChord: 1.3, sweep: 3.0, z: 0.06, winglets: true },
    tail: { tType: true, finHeight: 2.6, stabSpan: 6.4 },
    windows: { count: 7, size: 0.42, centre: 1.5 },
    doorZ: -4.4,
    airstair: true,
    seats: 9,
  },
  'long-range-jet': {
    cls: 'long-range-jet',
    length: 30.4,
    span: 30.4,
    fuselage: { w: 2.6, h: 2.55 },
    clearance: 1.25,
    engine: { kind: 'jet-rear', count: 2, radius: 0.78 },
    wing: { position: 'low', rootChord: 5.4, tipChord: 1.7, sweep: 6.8, z: 0.02, winglets: true },
    tail: { tType: true, finHeight: 3.7, stabSpan: 9.6 },
    windows: { count: 14, size: 0.46, centre: 1.0 },
    doorZ: -6.8,
    airstair: true,
    seats: 13,
  },
  'airliner-jet': {
    cls: 'airliner-jet',
    length: 38.7,
    span: 35.8,
    fuselage: { w: 3.8, h: 4.0 },
    clearance: 1.9,
    engine: { kind: 'jet-under', count: 2, radius: 1.1 },
    wing: { position: 'low', rootChord: 6.6, tipChord: 2.0, sweep: 8.5, z: -0.03, winglets: true },
    tail: { tType: false, finHeight: 5.6, stabSpan: 12.6 },
    windows: { count: 26, size: 0.5, centre: -2.0 },
    doorZ: 9.0,
    airstair: true,
    seats: 18,
  },
};

export const aircraftSpec = (cls: AircraftClass): AircraftSpec => AIRCRAFT_SPECS[cls];

/** Centre height of the fuselage above the ground. */
export const bodyHeight = (spec: AircraftSpec): number => spec.clearance + spec.fuselage.h / 2;

/** Where the boarding door is, in the model's frame (left side, on the ground). */
export function doorPoint(spec: AircraftSpec): readonly [x: number, y: number, z: number] {
  return [spec.fuselage.w / 2, bodyHeight(spec), spec.doorZ];
}

/** A footprint box (width across, length along) with a margin, for parking and collision. */
export function footprint(spec: AircraftSpec, scale = 1): { readonly w: number; readonly d: number } {
  return { w: spec.span * scale, d: spec.length * scale };
}
