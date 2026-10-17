import type { PropSpec } from '../../interiors/props/prop-types';
import type { KitModel } from '../../interiors/kit/kit-manifest';
import { npc, place, seat, stand } from '../../interiors/templates/helpers';
import type { FurniturePlacement, InteriorTemplate, NpcSpot, Opening, PlayerSpots, Spot, WindowSpec } from '../../interiors/templates/types';
import type { HomeLayout, LayoutRoom, PortalSpec } from '../../interiors/layouts/types';
import { AIRCRAFT_CLASSES, isJetClass, type AircraftClass } from '../contract';
import { AIRCRAFT_SPECS } from '../model/aircraft-spec';

/**
 * Walkable cabins and cockpits for the seven aircraft classes, generalising the AIR OBO layout (`showcase.ts`): the same
 * conventions (the nose is at -x; the cabin door is on the back wall near the cockpit; cockpit through the left wall;
 * lavatory aft), three practical lights and one mood per layout so moving between rooms never recompiles shaders.
 * Seat count follows `AIRCRAFT_SPECS[cls].seats`; chairs, cabin depth and ceiling grow with the class. Pure data, so the
 * template registry (`interiors/templates/registry.ts`) and tests can use it.
 *
 * Rooms (ids): `cabin` (entry), `cockpit`, `lavatory`, `suite`. Pistons are one room (the pilots sit up front); the
 * turboprop adds the cockpit; jets add the lavatory; the long-range jet and the airliner add a suite. Hotspots/actions and
 * cabin decor attach to these rooms later (`LayoutRoom.actions`, the decor system keyed by template id and room id).
 */

export const AIRCRAFT_TEMPLATE_PREFIX = 'aircraft-';
/** Template id of a class's cabin (the layout id); rooms of the layout are `<id>:cockpit`, `<id>:lavatory`, `<id>:suite`. */
export const aircraftTemplateId = (cls: AircraftClass): AircraftTemplateId => `${AIRCRAFT_TEMPLATE_PREFIX}${cls}`;
export type AircraftTemplateId = `aircraft-${AircraftClass}`;
export const AIRCRAFT_TEMPLATE_IDS: readonly AircraftTemplateId[] = AIRCRAFT_CLASSES.map(aircraftTemplateId);

const LIGHT = '#ffe2b0';
const WALNUT = '#5d3a1a';

interface Plan {
  readonly style: 'rows' | 'club';
  readonly depth: number;
  readonly height: number;
  readonly cockpit: boolean;
  readonly lavatory: boolean;
  readonly suite: boolean;
  readonly crew: boolean;
  readonly chair: KitModel;
  readonly chairScale: number;
  readonly seatColor: string;
  readonly wall: string;
  readonly band: string;
  readonly floor: string;
  readonly floorKind: 'carpet' | 'vinyl';
  readonly pitch: number;
}

const PLANS: Readonly<Record<AircraftClass, Plan>> = {
  'piston-single': { style: 'rows', depth: 2.4, height: 1.5, cockpit: false, lavatory: false, suite: false, crew: false, chair: 'loungeChair', chairScale: 0.8, seatColor: '#6b7280', wall: '#d8d4cb', band: '#9a958a', floor: '#6f6a60', floorKind: 'vinyl', pitch: 1.35 },
  'piston-twin': { style: 'rows', depth: 2.5, height: 1.6, cockpit: false, lavatory: false, suite: false, crew: false, chair: 'loungeChair', chairScale: 0.85, seatColor: '#8a7b64', wall: '#ddd8cd', band: '#a39b8a', floor: '#7a7367', floorKind: 'vinyl', pitch: 1.35 },
  turboprop: { style: 'rows', depth: 2.9, height: 1.85, cockpit: true, lavatory: false, suite: false, crew: false, chair: 'loungeChair', chairScale: 0.95, seatColor: '#26466d', wall: '#e8e4da', band: '#b7ad98', floor: '#8b8576', floorKind: 'carpet', pitch: 1.3 },
  'light-jet': { style: 'club', depth: 2.9, height: 1.95, cockpit: true, lavatory: true, suite: false, crew: true, chair: 'loungeChair', chairScale: 1.0, seatColor: '#3f4a57', wall: '#efe9dc', band: '#cfc4ad', floor: '#b9ae98', floorKind: 'carpet', pitch: 3.0 },
  'midsize-jet': { style: 'club', depth: 3.0, height: 2.15, cockpit: true, lavatory: true, suite: false, crew: true, chair: 'loungeChair', chairScale: 1.05, seatColor: '#a9835a', wall: '#f1ebdf', band: '#d3c8b0', floor: '#c2b79f', floorKind: 'carpet', pitch: 3.0 },
  'long-range-jet': { style: 'club', depth: 3.2, height: 2.35, cockpit: true, lavatory: true, suite: true, crew: true, chair: 'loungeChairRelax', chairScale: 1.0, seatColor: '#f4f0e8', wall: '#f3ede2', band: '#d9cdb5', floor: '#cbbfa6', floorKind: 'carpet', pitch: 3.0 },
  'airliner-jet': { style: 'club', depth: 3.8, height: 2.6, cockpit: true, lavatory: true, suite: true, crew: true, chair: 'loungeChairRelax', chairScale: 1.15, seatColor: '#f4f0e8', wall: '#f6f1e6', band: '#ddd1b8', floor: '#cdc2aa', floorKind: 'carpet', pitch: 3.0 },
};

/** Free floor kept at the nose end (the cabin door, the way to the cockpit). */
const FORE = 2.3;
/** Free floor aft of the last seat (lavatory door; more when the suite door sits there too). */
const AFT = (plan: Plan): number => 0.8 + (plan.lavatory ? 0.9 : 0) + (plan.suite ? 1.4 : 0);

const sideCounts = (seats: number): readonly [back: number, front: number] => [Math.ceil(seats / 2), Math.floor(seats / 2)];

/** Number of seat positions along the length for a side with `count` seats. */
const slotsFor = (plan: Plan, count: number): number => (plan.style === 'rows' ? count : Math.ceil(count / 2));

export function cabinWidth(cls: AircraftClass): number {
  const plan = PLANS[cls];
  const spec = AIRCRAFT_SPECS[cls];
  const [back, front] = sideCounts(spec.seats);
  const slots = Math.max(slotsFor(plan, back), slotsFor(plan, front));
  const pilots = cls === 'piston-single' || cls === 'piston-twin' ? 1 : 0;
  return Math.round((FORE * (pilots ? 0.5 : 1) + (slots + pilots) * plan.pitch + AFT(plan)) * 10) / 10;
}

/** Where the passenger seats are, in room space with their facing (degrees; 90 faces +x, -90 faces -x). */
export function passengerSeats(cls: AircraftClass): ReadonlyArray<{ readonly at: readonly [number, number]; readonly rot: number; readonly table: readonly [number, number] | null }> {
  const plan = PLANS[cls];
  const spec = AIRCRAFT_SPECS[cls];
  const width = cabinWidth(cls);
  const pilots = cls === 'piston-single' || cls === 'piston-twin';
  const x0 = -width / 2 + (pilots ? FORE * 0.5 + plan.pitch : FORE) + plan.pitch / 2;
  const sz = plan.depth / 2 - 0.62;
  const [back, front] = sideCounts(spec.seats);
  const out: Array<{ at: readonly [number, number]; rot: number; table: readonly [number, number] | null }> = [];
  for (const [count, z] of [[back, -sz], [front, sz]] as const) {
    if (plan.style === 'rows') {
      // Pistons sit in a tight two-by-N; the turboprop has an aisle.
      const rz = plan.depth < 2.6 ? Math.sign(z) * (plan.depth / 2 - 0.33) : z;
      for (let i = 0; i < count; i++) out.push({ at: [x0 + i * plan.pitch, rz], rot: -90, table: null });
    } else {
      // Club pairs facing each other round a walnut table.
      for (let i = 0; i < count; i++) {
        const block = Math.floor(i / 2);
        const first = i % 2 === 0;
        const centre = x0 + block * plan.pitch;
        out.push({ at: [centre + (first ? -0.75 : 0.75), z], rot: first ? 90 : -90, table: first ? [centre, z] : null });
      }
    }
  }
  return out;
}

function windows(width: number, plan: Plan, avoid: readonly number[]): WindowSpec[] {
  const out: WindowSpec[] = [];
  const step = width < 6 ? 0.95 : 1.35;
  for (let x = -width / 2 + 1.0; x < width / 2 - 0.5; x += step) {
    if (avoid.some((a) => Math.abs(a - x) < 0.8)) continue;
    out.push({ wall: 'back', at: Math.round(x * 100) / 100, width: 0.42, sill: plan.height * 0.36, height: 0.5, bars: false });
  }
  return out;
}

const palette = (hex: string) => ({ carpetBlue: hex, carpet: hex, carpetDarker: hex });

function cabinTemplate(cls: AircraftClass): { readonly template: InteriorTemplate; readonly doors: readonly string[] } {
  const plan = PLANS[cls];
  const width = cabinWidth(cls);
  const pilots = cls === 'piston-single' || cls === 'piston-twin';
  const id = aircraftTemplateId(cls);
  const seats = passengerSeats(cls);
  const doors: Opening[] = [];
  const doorIds: string[] = [];
  // The cabin door sits on the back wall by the nose; pistons have it behind the rear row.
  const doorX = pilots ? width / 2 - 0.55 : -width / 2 + 1.1;
  doors.push({ wall: 'back', at: doorX, width: 0.9 });
  doorIds.push('door');
  if (plan.cockpit) {
    doors.push({ wall: 'left', at: 0.5, width: 0.8 });
    doorIds.push('cockpit');
  }
  let aft = width / 2 - 0.9;
  if (plan.lavatory) {
    doors.push({ wall: 'back', at: aft, width: 0.8 });
    doorIds.push('lavatory');
    aft -= 1.4;
  }
  if (plan.suite) {
    doors.push({ wall: 'back', at: aft, width: 0.9 });
    doorIds.push('suite');
  }

  const furniture: FurniturePlacement[] = [];
  const props: PropSpec[] = [];
  const chairs = (at: readonly [number, number], rot: number): FurniturePlacement => place(plan.chair, at as [number, number], rot, { scale: plan.chairScale, palette: palette(plan.seatColor) });
  seats.forEach((s) => furniture.push(chairs(s.at, s.rot)));
  for (const s of seats) {
    if (s.table) props.push({ kind: 'box', at: s.table as [number, number], size: [0.55, 0.7, 0.5], color: WALNUT, surface: 'wood', round: 0.04 });
  }
  if (pilots) {
    // Pilots up front, as in a Cessna: two seats facing the nose.
    const x = -width / 2 + FORE * 0.5;
    const pz = plan.depth / 2 - 0.33;
    furniture.push({ ...chairs([x, -pz], -90), thing: { kind: 'chair', name: 'Captain’s seat' } });
    furniture.push({ ...chairs([x, pz], -90), thing: { kind: 'chair', name: 'Co-pilot seat' } });
    props.push({ kind: 'box', at: [-width / 2 + 0.2, 0], size: [0.3, 0.8, plan.depth - 0.3], color: '#22262c', surface: 'metal' });
  }
  if (plan.lavatory === false && !pilots) {
    // A coat cupboard at the back keeps the turboprop's rear from looking bare.
    props.push({ kind: 'box', at: [width / 2 - 0.45, -plan.depth / 2 + 0.4], size: [0.7, 1.1, 0.5], color: WALNUT, surface: 'wood', round: 0.04 });
  }
  if (plan.lavatory) {
    // Galley cabinet by the cockpit door end, champagne on top.
    props.push({ kind: 'box', at: [-width / 2 + 0.4, -plan.depth / 2 + 0.5], size: [0.7, 1.0, 0.5], color: '#4a2c14', surface: 'wood' });
    props.push({ kind: 'bottles', at: [-width / 2 + 0.4, -plan.depth / 2 + 0.5], y: 1.0, count: 3, colors: ['#1b3b2a', '#e8d9a8', '#1b3b2a'] });
  }
  if (isJetClass(cls)) {
    props.push({ kind: 'box', at: [0, -plan.depth / 2 + 0.03], y: plan.height * 0.34, size: [width - 0.4, 0.04, 0.04], color: '#c9a227', surface: 'metal' });
  }

  const practicals: ReadonlyArray<readonly [number, number, number]> = [[-width / 3, plan.height - 0.2, 0.2], [0, plan.height - 0.2, 0.2], [width / 3, plan.height - 0.2, 0.2]];
  const firstSeat = seats[0];
  const secondSeat = seats[1] ?? seats[0];
  const standAt: [number, number] = pilots ? [width / 2 - 1.0, 0.1] : [-width / 2 + 1.5, 0.5];
  const player: PlayerSpots = {
    default: stand(standAt, pilots ? 270 : 120),
    ...(firstSeat ? { sit: seat(firstSeat.at as [number, number], firstSeat.rot) } : {}),
    ...(secondSeat ? { drink: seat(secondSeat.at as [number, number], secondSeat.rot, 'drink') } : {}),
    ...(pilots ? { drive: seat([-width / 2 + FORE * 0.5, -(plan.depth / 2 - 0.33)], -90, 'drive', { y: 0.02 }) } : {}),
  };
  const npcs: NpcSpot[] = plan.crew ? [npc(stand([width / 2 - (plan.lavatory ? 2.0 : 1.0) - (plan.suite ? 1.4 : 0), 0.9], 270, 'talk'), 'corporate', { gender: 'female' })] : [];
  const guestSeats: Spot[] = seats.slice(2, 5).map((s) => seat(s.at as [number, number], s.rot));
  const guests: Spot[] = [...guestSeats, stand([0.2, 0.5], 250, 'talk')];

  const template: InteriorTemplate = {
    id,
    label: 'Cabin',
    room: {
      width,
      depth: plan.depth,
      height: plan.height,
      floor: plan.floorKind,
      floorColor: plan.floor,
      wall: { style: 'panel', color: plan.wall, band: plan.band },
      windows: windows(width, plan, doors.filter((d) => d.wall === 'back').map((d) => d.at)),
      doors,
    },
    furniture,
    props,
    player,
    npcs,
    guests,
    lighting: { mood: 'home', practicals, practicalColor: LIGHT },
  };
  return { template, doors: doorIds };
}

/** The flight deck: two pilot seats, glass displays, the windscreen. Nothing here starts an engine. */
function cockpitTemplate(cls: AircraftClass): InteriorTemplate {
  const plan = PLANS[cls];
  const big = cls === 'airliner-jet' || cls === 'long-range-jet';
  const w = big ? 3.4 : 2.8;
  const d = big ? 3.0 : 2.6;
  const seatPalette = palette(plan.seatColor);
  const model: KitModel = plan.chair;
  const reg = cls.replace(/-/g, ' ').toUpperCase();
  return {
    id: `${aircraftTemplateId(cls)}:cockpit`,
    label: 'Cockpit',
    room: {
      width: w,
      depth: d,
      height: Math.min(plan.height, 2.1),
      floor: 'dark',
      floorColor: '#2b2f36',
      wall: { style: 'panel', color: '#3a3f47' },
      windows: [
        { wall: 'left', at: -0.6, width: 0.9, sill: 1.0, height: 0.6, bars: false },
        { wall: 'left', at: 0.6, width: 0.9, sill: 1.0, height: 0.6, bars: false },
      ],
      doors: [{ wall: 'back', at: w / 2 - 0.6, width: 0.7 }],
    },
    furniture: [
      { ...place(model, [-w / 2 + 1.0, d * 0.2], -90, { scale: plan.chairScale, palette: seatPalette }), thing: { kind: 'chair', name: 'Captain’s seat' } },
      { ...place(model, [-w / 2 + 1.0, -d * 0.2], -90, { scale: plan.chairScale, palette: seatPalette }), thing: { kind: 'chair', name: 'Co-pilot seat' } },
    ],
    props: [
      { kind: 'box', at: [-w / 2 + 0.25, 0], size: [0.45, 0.95, d - 0.1], color: '#22262c', surface: 'metal' },
      { kind: 'sign', at: [-w / 2 + 0.49, d * 0.2], rot: 90, y: 0.6, wall: true, size: [0.5, 0.28], lines: ['FL 410', 'GROUND · PARKED'], bg: '#06121f', fg: '#46e0ff', accent: '#7cffb2', style: 'screen' },
      { kind: 'sign', at: [-w / 2 + 0.49, -d * 0.2], rot: 90, y: 0.6, wall: true, size: [0.5, 0.28], lines: [reg], bg: '#06121f', fg: '#46e0ff', accent: '#f6b90b', style: 'screen' },
    ],
    player: {
      default: stand([w / 2 - 0.9, 0.2], 270),
      drive: seat([-w / 2 + 1.0, d * 0.2], -90, 'drive', { y: 0.02 }),
      phone: seat([-w / 2 + 1.0, -d * 0.2], -90, 'phone', { y: 0.02 }),
    },
    npcs: [],
    guests: [stand([w / 2 - 0.9, -0.8], 250, 'talk')],
    lighting: { mood: 'home', practicals: [[-0.2, 1.9, 0.0], [0.6, 1.9, -0.6], [0.6, 1.9, 0.6]], practicalColor: LIGHT },
  };
}

function lavatoryTemplate(cls: AircraftClass): InteriorTemplate {
  return {
    id: `${aircraftTemplateId(cls)}:lavatory`,
    label: 'Lavatory',
    room: {
      width: 2.2,
      depth: 2.0,
      height: Math.min(PLANS[cls].height, 2.1),
      floor: 'marble',
      floorColor: '#efe9df',
      wall: { style: 'tiles', color: '#f4efe6', band: '#c9a227' },
      windows: [{ wall: 'back', at: 0.45, width: 0.3, sill: 1.3, height: 0.35, bars: false }],
      doors: [{ wall: 'left', at: 0.35, width: 0.7 }],
    },
    furniture: [place('toilet', [0.45, -0.62]), place('bathroomSink', [-0.5, -0.78]), place('bathroomMirror', [-0.5, -0.95], 0, { y: 1.1 })],
    props: [{ kind: 'box', at: [0, -0.98], y: 0.92, size: [2.1, 0.04, 0.04], color: '#c9a227', surface: 'metal' }],
    player: { default: stand([0.2, 0.55], 30), sit: seat([0.45, -0.62], 0, 'sit', { y: 0.06, props: false }) },
    npcs: [],
    guests: [stand([0.75, 0.55], 300, 'talk')],
    lighting: { mood: 'home', practicals: [[0.0, 1.9, 0.0], [-0.5, 1.9, -0.5], [0.5, 1.9, 0.3]], practicalColor: LIGHT },
  };
}

/** The rest suite of the big jets: a double bed, bedside tables and a wardrobe. */
function suiteTemplate(cls: AircraftClass): InteriorTemplate {
  const plan = PLANS[cls];
  return {
    id: `${aircraftTemplateId(cls)}:suite`,
    label: 'Suite',
    room: {
      width: 4.2,
      depth: plan.depth,
      height: Math.min(plan.height, 2.3),
      floor: 'carpet',
      floorColor: plan.floor,
      wall: { style: 'panel', color: plan.wall, band: plan.band },
      windows: [-1.0, 1.0].map((at) => ({ wall: 'back' as const, at, width: 0.42, sill: plan.height * 0.36, height: 0.5, bars: false })),
      doors: [{ wall: 'left', at: 0.6, width: 0.9 }],
    },
    furniture: [
      place('bedDouble', [0.6, -plan.depth / 2 + 0.7], 0, { scale: 1.0, palette: palette('#e9e2d0') }),
      place('sideTable', [-0.5, -plan.depth / 2 + 0.3]),
      place('sideTable', [1.7, -plan.depth / 2 + 0.3]),
      place('bookcaseClosedWide', [1.6, plan.depth / 2 - 0.3], 180),
    ],
    props: [],
    player: { default: stand([-1.4, 0.4], 90), sleep: { at: [0.6, 0.4, -plan.depth / 2 + 0.7], rot: 0, animation: 'sleep' } },
    npcs: [],
    guests: [stand([-1.0, 0.9], 120, 'talk')],
    lighting: { mood: 'home', practicals: [[-1.0, 2.0, 0.0], [0.6, 2.0, -0.6], [1.8, 2.0, 0.4]], practicalColor: LIGHT },
  };
}

const sideRoom = (id: string, label: string, template: InteriorTemplate, to: string): LayoutRoom => ({
  id,
  label,
  level: 0,
  template,
  portals: [{ id: to, via: { door: 0 }, to: { room: to, portal: id } }],
  actions: [],
});

function buildLayout(cls: AircraftClass): HomeLayout {
  const plan = PLANS[cls];
  const { template, doors } = cabinTemplate(cls);
  const portals: PortalSpec[] = doors.map((door, index) => ({
    id: door === 'door' ? 'airstair' : door,
    via: { door: index },
    to: door === 'door' ? null : { room: door, portal: 'cabin' },
  }));
  const rooms: LayoutRoom[] = [{ id: 'cabin', label: 'Cabin', level: 0, template, portals, actions: [] }];
  if (plan.cockpit) rooms.push(sideRoom('cockpit', 'Cockpit', cockpitTemplate(cls), 'cabin'));
  if (plan.lavatory) rooms.push(sideRoom('lavatory', 'Lavatory', lavatoryTemplate(cls), 'cabin'));
  if (plan.suite) rooms.push(sideRoom('suite', 'Suite', suiteTemplate(cls), 'cabin'));
  return { id: aircraftTemplateId(cls), entry: 'cabin', rooms, activityRooms: {} };
}

/** The walkable cabin layout of each class (entry: the cabin door). */
export const AIRCRAFT_LAYOUTS: Readonly<Record<AircraftTemplateId, HomeLayout>> = Object.fromEntries(
  AIRCRAFT_CLASSES.map((cls) => [aircraftTemplateId(cls), buildLayout(cls)]),
) as Record<AircraftTemplateId, HomeLayout>;

export const aircraftLayoutFor = (cls: AircraftClass): HomeLayout => AIRCRAFT_LAYOUTS[aircraftTemplateId(cls)];

export const isAircraftTemplateId = (id: string): id is AircraftTemplateId => (AIRCRAFT_TEMPLATE_IDS as readonly string[]).includes(id);

/** The class a cabin template id is for. */
export const classOfTemplate = (id: AircraftTemplateId): AircraftClass => id.slice(AIRCRAFT_TEMPLATE_PREFIX.length) as AircraftClass;
