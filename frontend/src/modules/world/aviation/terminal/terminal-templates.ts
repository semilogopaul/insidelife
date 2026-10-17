import type { PropSpec } from '../../interiors/props/prop-types';
import { npc, place, seat, stand } from '../../interiors/templates/helpers';
import type { InteriorTemplate } from '../../interiors/templates/types';
import { AIRSIDE_ROOM } from './apron-layout';

/**
 * The General Aviation Terminal (venue type `aviation-terminal`: `mmia-gat`, `naia-gat`): a lounge with an aircraft sales
 * desk and a flight-school corner, and a door to the airside. The airside is an outdoor apron: a row of hangars with
 * closed doors, a "Hangar row" board and the planes (`terminal/Apron.tsx` draws them; `apron-layout.ts` places them).
 */

export const AVIATION_TERMINAL_ID = 'aviation-terminal';
export const AIRSIDE_ID = 'aviation-terminal:airside';

const NAVY = '#16324f';
const SKY = '#2d8fd5';
const AMBER = '#f6b90b';

/** The lounge: marble, navy band, windows on the apron; the way out is on the left wall, the airside door at the back. */
export const AVIATION_LOUNGE: InteriorTemplate = {
  id: AVIATION_TERMINAL_ID,
  label: 'GAT lounge',
  room: {
    width: 14,
    depth: 9,
    height: 3.6,
    floor: 'marble',
    floorColor: '#e3e6e9',
    wall: { style: 'paint', color: '#f1f3f5', band: NAVY },
    windows: [
      { wall: 'back', at: -1.2, width: 2.6, sill: 0.4, height: 2.4, bars: false },
      { wall: 'back', at: 2.2, width: 2.2, sill: 0.4, height: 2.4, bars: false },
    ],
    doors: [
      { wall: 'left', at: 1.4, width: 1.6 },
      { wall: 'back', at: 5.2, width: 1.8 },
    ],
  },
  furniture: [
    // Lounge: two sofas round a glass table, a plant at each end.
    place('loungeSofaLong', [3.2, 1.5], 180, { palette: { carpetBlue: NAVY, carpet: NAVY, carpetDarker: '#0e2238' } }),
    place('loungeSofaLong', [3.2, 3.5], 0, { palette: { carpetBlue: NAVY, carpet: NAVY, carpetDarker: '#0e2238' } }),
    place('tableCoffeeGlass', [3.2, 2.5]),
    place('loungeChairRelax', [5.7, 2.5], -90, { palette: { carpetBlue: SKY, carpet: SKY, carpetDarker: '#1f6aa0' } }),
    place('pottedPlant', [-6.3, -3.8], 0, { scale: 1.5 }),
    place('pottedPlant', [6.3, 3.9], 0, { scale: 1.5 }),
    place('rugRectangle', [3.2, 2.5], 0, { scale: 3 }),
    // Flight school: two desks and chairs, a bookcase.
    place('desk', [-0.9, -2.7], 0),
    place('chairDesk', [-0.9, -2.0], 180),
    place('desk', [1.1, -2.7], 0),
    place('chairDesk', [1.1, -2.0], 180),
    place('bookcaseClosedWide', [-2.7, -4.1], 0),
    place('trashcan', [6.5, -3.6]),
  ],
  props: [
    // Aircraft sales desk, back left.
    { kind: 'bar-counter', at: [-5.0, -3.0], length: 3.2, color: '#e9edf1', top: NAVY, thing: { kind: 'counter', name: 'Aircraft sales desk' } },
    { kind: 'sign', at: [-5.0, -4.47], y: 2.6, wall: true, size: [3.0, 0.5], lines: ['AIRCRAFT SALES'], bg: NAVY, fg: '#ffffff', accent: AMBER, style: 'painted' },
    { kind: 'sign', at: [-6.4, -4.47], y: 1.5, wall: true, size: [0.7, 0.9], lines: ['NEW', 'AND', 'USED'], bg: '#0b1b2b', fg: AMBER, accent: '#ffffff', style: 'poster' },
    // Flight school corner, back centre.
    { kind: 'sign', at: [0.1, -4.47], y: 2.3, wall: true, size: [3.0, 0.9], lines: ['FLIGHT SCHOOL', 'PRIVATE PILOT LICENCE'], bg: '#0e2a1c', fg: '#ffffff', accent: AMBER, style: 'board', thing: { kind: 'exhibit', name: 'Flight school board' } },
    { kind: 'lectern', at: [0.1, -3.7], color: '#2a2f36' },
    // Airside door and departures.
    { kind: 'sign', at: [5.2, -4.47], y: 2.9, wall: true, size: [1.8, 0.44], lines: ['AIRSIDE'], bg: AMBER, fg: '#111111', style: 'painted' },
    { kind: 'sign', at: [-6.98, 3.6], rot: 90, y: 2.2, wall: true, size: [3.0, 1.1], lines: ['GENERAL AVIATION', 'PRIVATE CHARTERS · OWN AIRCRAFT', 'LAGOS ⇄ ABUJA ON REQUEST'], bg: '#0b1b2b', fg: AMBER, accent: '#21d4fd', style: 'screen' },
    { kind: 'luggage', at: [4.6, 0.2], rot: 25, color: '#263238' },
    { kind: 'luggage', at: [-3.4, 1.8], rot: -20, color: '#7b3f1d' },
    { kind: 'water-dispenser', at: [6.5, -1.2] },
  ],
  player: {
    default: stand([-5.2, 1.4], 90),
    sit: seat([3.2, 3.5], 0),
    phone: seat([3.2, 3.5], 0, 'phone'),
    read: seat([3.2, 3.5], 0, 'read'),
    walk: stand([2.0, 0.4], 0, 'walk'),
  },
  npcs: [
    npc(stand([-5.0, -3.9], 0, 'talk'), 'uniform', { gender: 'female' }),
    npc(stand([0.1, -3.2], 180, 'talk'), 'corporate'),
    npc(seat([2.6, 1.5], 180, 'phone'), 'corporate', { lod: 'low' }),
    npc(stand([-3.4, 0.6], 90, 'idle'), 'casual', { lod: 'low' }),
  ],
  guests: [seat([3.8, 3.5], 0, 'sit'), stand([-2.0, 1.2], 70, 'talk'), stand([0.6, 1.6], 250, 'idle')],
  lighting: { mood: 'office', practicals: [[-3.0, 3.3, 0.0], [1.5, 3.3, 0.0], [5.0, 3.3, 0.0]] },
};

const HANGAR_XS = [-18, -9, 0, 9, 18] as const;

/** Hangars: a steel shell, a roof lip and a closed door with its number. */
function hangars(): PropSpec[] {
  const z = -AIRSIDE_ROOM.depth / 2 + 2.2;
  const front = z + 2.2;
  return HANGAR_XS.flatMap((x, index): PropSpec[] => [
    { kind: 'box', at: [x, z], size: [8, 5.2, 4.4], color: index % 2 ? '#c5ccd3' : '#b6bec6', surface: 'metal', round: 0.05 },
    { kind: 'box', at: [x, z], y: 5.2, size: [8.4, 0.3, 4.8], color: '#4b5563', surface: 'metal', round: 0.05 },
    { kind: 'box', at: [x, front + 0.04], size: [5.6, 4.1, 0.14], color: '#7b8591', surface: 'metal', round: 0.05 },
    { kind: 'sign', at: [x, front + 0.13], y: 4.5, wall: true, size: [2.2, 0.42], lines: [`HANGAR ${index + 1}`], bg: NAVY, fg: '#ffffff', accent: AMBER, style: 'painted' },
  ]);
}

/** The airside: outdoor apron, asphalt, hangars and boards. The planes are drawn by `Apron`. */
export const AVIATION_AIRSIDE: InteriorTemplate = {
  id: AIRSIDE_ID,
  label: 'Airside',
  room: {
    width: AIRSIDE_ROOM.width,
    depth: AIRSIDE_ROOM.depth,
    height: AIRSIDE_ROOM.height,
    floor: 'asphalt',
    floorColor: '#50555c',
    wall: { style: 'none', color: '#9aa3ad' },
    outdoor: true,
    doors: [{ wall: 'left', at: 11, width: 1.8 }],
  },
  furniture: [],
  props: [
    ...hangars(),
    { kind: 'sign', at: [-2.4, -8.3], size: [3.6, 1.0], lines: ['HANGAR ROW', 'AIRCRAFT NOT ON THE APRON ARE INSIDE'], bg: NAVY, fg: '#ffffff', accent: AMBER, style: 'poster', thing: { kind: 'exhibit', name: 'Hangar row board' } },
    // The terminal door: a canopy over it and a sign.
    { kind: 'canopy', at: [-21.2, 11], size: [3.2, 3.6], color: '#d6dbe0', trim: NAVY, height: 3.0 },
    { kind: 'sign', at: [-22.4, 8.6], rot: 90, size: [2.0, 0.6], lines: ['GAT LOUNGE'], bg: NAVY, fg: '#ffffff', accent: AMBER, style: 'painted' },
  ],
  player: { default: stand([-20.6, 11], 270) },
  npcs: [npc(stand([-19.5, 8.6], 180, 'talk'), 'uniform', { gender: 'male' }), npc(stand([4.0, -7.4], 180, 'idle'), 'uniform', { lod: 'low' })],
  guests: [stand([-19.8, 12.8], 300, 'idle'), stand([-18.0, 9.4], 260, 'talk'), stand([-17.0, 13.0], 250, 'idle')],
  lighting: { mood: 'outdoor', practicals: [[-16, 6, 10], [0, 6, 10], [16, 6, 10]] },
};
