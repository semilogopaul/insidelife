import type { PropSpec } from '../../props/prop-types';
import { gridPoints, npc, place, row, seat, stand } from '../helpers';
import type { FurniturePlacement, InteriorTemplate, NpcSpot } from '../types';

/** A row of fixed lecture seats with a writing ledge in front, facing +X. */
function lectureRow(x: number, z: number, count: number): PropSpec[] {
  return [
    { kind: 'seat-row', at: [x, z], rot: 90, count, color: '#2e5d3a', frame: '#3a3f45' },
    { kind: 'box', at: [x + 0.48, z], size: [0.3, 0.62, count * 0.56], color: '#8a5a36', surface: 'wood', round: 0.1 },
  ];
}

/** UNILAG lecture hall with a library corner: students face the projector screen (and the camera). */
export const CAMPUS: InteriorTemplate = {
  id: 'campus',
  label: 'Lecture hall',
  room: {
    width: 10,
    depth: 8,
    height: 3.2,
    floor: 'terrazzo',
    floorColor: '#cbc2ae',
    wall: { style: 'paint', color: '#ece5d2', band: '#2f6b4a' },
    windows: [{ wall: 'back', at: 0.2, width: 1.6 }, { wall: 'back', at: 2.8, width: 1.6 }, { wall: 'left', at: 1.8, width: 1.6 }],
    doors: [{ wall: 'left', at: -0.6, width: 1.1 }],
  },
  furniture: [
    ...row('bookcaseOpen', 4, [-4.45, -3.7], [0.62, 0], 0, { palette: { wood: '#6d4c41' } }),
    place('bookcaseClosedWide', [-4.7, -2.3], 90, { palette: { wood: '#6d4c41' } }),
    place('table', [-3.4, -2.25], 0, { palette: { wood: '#8a5a36' } }),
    place('chair', [-3.75, -1.7], 180),
    place('chair', [-3.05, -1.7], 180),
    place('books', [-3.5, -2.3], 15, { y: 0.5 }),
    place('lampRoundTable', [-3.0, -2.35], 0, { y: 0.5 }),
    place('pottedPlant', [4.6, -3.65]),
    place('trashcan', [4.65, 3.6]),
  ],
  props: [
    ...lectureRow(-1.9, -1.15, 4),
    ...lectureRow(-0.7, -1.15, 4),
    ...lectureRow(0.5, -1.15, 4),
    ...lectureRow(-1.9, 2.05, 3),
    ...lectureRow(-0.7, 2.05, 3),
    ...lectureRow(0.5, 2.05, 3),
    { kind: 'sign', at: [3.9, 0.4], rot: -90, size: [2.8, 1.45], lines: ['MAC 101: INTRO TO MASS COMM', 'Agenda setting & you', '— Dr. Adebayo'], bg: '#f7f7f5', fg: '#13606b', accent: '#2f6b4a', frame: '#3a3f45', style: 'board' },
    { kind: 'lectern', at: [3.4, -1.7], rot: -90 },
    { kind: 'sign', at: [-0.6, -3.98], y: 2.55, wall: true, size: [3.4, 0.8], lines: ['UNIVERSITY OF LAGOS', 'DEPARTMENT OF MASS COMMUNICATION'], bg: '#2f6b4a', fg: '#f6b90b', venueName: true },
    { kind: 'sign', at: [-3.8, -3.98], y: 2.55, wall: true, size: [1.4, 0.36], lines: ['LIBRARY • SILENCE'], bg: '#f6b90b', fg: '#0e2733' },
    { kind: 'sign', at: [-4.98, 0.6], rot: 90, y: 1.65, wall: true, size: [1.1, 0.8], lines: ['NOTICE', 'MAC 205 test moved', 'to Friday 8am', 'NO EXTENSION!'], bg: '#c69a5b', fg: '#2b1b15', style: 'board' },
    { kind: 'aircon', at: [1.5, -3.98], y: 2.75 },
    { kind: 'aircon', at: [-4.98, 2.9], rot: 90, y: 2.75 },
    { kind: 'water-dispenser', at: [4.6, -2.8], rot: -90 },
  ],
  player: {
    default: stand([2.3, 2.6], 210),
    sit: seat([0.5, -0.59], 90),
    read: seat([0.5, -0.59], 90, 'read'),
    type: seat([0.5, -0.59], 90, 'type'),
    phone: seat([0.5, -0.59], 90, 'phone'),
    eat: seat([0.5, -0.59], 90, 'eat'),
    talk: stand([2.4, 2.4], 220, 'talk'),
  },
  npcs: [
    npc(stand([3.3, -0.9], -90, 'talk'), 'corporate', { gender: 'male' }),
    npc(seat([-1.9, -1.43], 90, 'read'), 'campus'),
    npc(seat([-0.7, -0.87], 90, 'type', { props: true }), 'campus'),
    npc(seat([0.5, -1.71], 90, 'phone'), 'campus'),
    npc(seat([-1.9, 2.05], 90, 'read'), 'campus'),
    npc(seat([-0.7, 2.61], 90, 'sit'), 'campus'),
    npc(seat([0.5, 1.49], 90, 'read'), 'campus'),
    npc(seat([-3.75, -1.7], 180, 'read'), 'campus'),
  ],
  guests: [seat([0.5, 2.05], 90, 'sit'), seat([-0.7, -1.43], 90, 'sit'), seat([-1.9, 1.49], 90, 'sit')],
  lighting: { mood: 'office', practicals: [[-0.6, 2.9, -1.0], [-0.6, 2.9, 2.0], [-3.6, 2.9, -2.6]] },
};

/** A secondary-school classroom: twin desks, a chalkboard, a teacher with chalk. */
export const SCHOOL: InteriorTemplate = {
  id: 'school',
  label: 'Classroom',
  room: {
    width: 8,
    depth: 6.4,
    height: 2.9,
    floor: 'cement',
    floorColor: '#b9b1a1',
    wall: { style: 'paint', color: '#f0e6c9', band: '#3d6fa8' },
    windows: [{ wall: 'back', at: -1.6, width: 1.4 }, { wall: 'back', at: 1.4, width: 1.4 }],
    doors: [{ wall: 'back', at: 3.1, width: 0.95 }],
  },
  furniture: [
    ...gridPoints(3, 3, [0.6, 0.4], [1.7, 1.55]).flatMap(([x, z]): FurniturePlacement[] => [place('table', [x, z], 90, { scale: 0.85, palette: { wood: '#a0683a' } }), place('chair', [x + 0.55, z - 0.28], -90), place('chair', [x + 0.55, z + 0.28], -90)]),
    place('desk', [-3.0, -2.2], 45, { palette: { wood: '#6d4c41' } }),
    place('chair', [-2.65, -1.85], 225),
  ],
  props: [
    { kind: 'sign', at: [-3.98, 0.4], rot: 90, y: 1.55, wall: true, size: [3.0, 1.2], lines: ['SS2 MATHEMATICS', 'x² + 5x + 6 = 0', '(x + 2)(x + 3) = 0'], bg: '#1f3b2d', fg: '#f4f4f0', frame: '#6d4c41', style: 'board' },
    { kind: 'sign', at: [0.0, -3.18], y: 2.4, wall: true, size: [2.8, 0.7], lines: ['ADENIRAN MEMORIAL SCHOOLS', 'KNOWLEDGE IS POWER'], bg: '#3d6fa8', fg: '#ffffff', venueName: true },
    { kind: 'sign', at: [-1.6, -3.18], y: 2.55, wall: true, size: [0.5, 0.3], lines: ['NO NOISE'], bg: '#ffffff', fg: '#c62828' },
    { kind: 'flag', at: [-3.6, 2.6] },
  ],
  player: {
    default: stand([2.9, 2.4], 220),
    sit: seat([2.25, 0.12], -90, 'sit'),
    read: seat([2.25, 0.12], -90, 'read'),
    type: seat([2.25, 0.12], -90, 'type'),
    phone: seat([2.25, 0.12], -90, 'phone'),
  },
  npcs: [
    npc(stand([-3.3, -0.4], 90, 'talk'), 'corporate', { gender: 'female' }),
    ...gridPoints(3, 3, [0.6, 0.4], [1.7, 1.55]).slice(0, 7).map(([x, z], i): NpcSpot => npc(seat([x + 0.55, z + (i % 2 === 0 ? 0.28 : -0.28)], -90, i % 3 === 0 ? 'read' : i % 3 === 1 ? 'sit' : 'type', { props: false }), 'campus')),
  ],
  guests: [seat([0.55, 1.67], -90, 'sit'), seat([2.25, 1.67], -90, 'sit')],
  lighting: { mood: 'office', practicals: [[0.0, 2.6, 0.0]], practicalColor: '#f4f8ff' },
};

/** JAMB CBT centre: rows of computers, a supervisor, server-downtime humour on the wall. */
export const CBT_CENTRE: InteriorTemplate = {
  id: 'cbt-centre',
  label: 'CBT centre',
  room: {
    width: 9,
    depth: 7,
    height: 2.8,
    floor: 'tiles',
    floorColor: '#d8d8d2',
    wall: { style: 'paint', color: '#e8eef2', band: '#1d4e89' },
    windows: [{ wall: 'back', at: 2.2, width: 1.4 }],
    doors: [{ wall: 'left', at: 2.4, width: 1.0 }],
  },
  furniture: [
    ...gridPoints(3, 4, [0.4, -0.6], [2.0, 1.3]).flatMap(([x, z]): FurniturePlacement[] => [
      place('desk', [x + 0.42, z], -90, { scale: 0.8, palette: { wood: '#eceff1' } }),
      place('computerScreen', [x + 0.55, z], -90, { y: 0.46 }),
      place('computerKeyboard', [x + 0.25, z], -90, { y: 0.46 }),
      place('chairDesk', [x - 0.15, z], 90),
    ]),
    place('desk', [-3.6, -2.6], 0),
    place('computerScreen', [-3.6, -2.75], 0, { y: 0.57 }),
    place('chairDesk', [-3.6, -2.05], 180),
  ],
  props: [
    { kind: 'sign', at: [0.0, -3.48], y: 2.3, wall: true, size: [3.4, 0.8], lines: ['IKEJA CBT CENTRE', 'JAMB UTME • CBT'], bg: '#1d4e89', fg: '#ffffff', accent: '#f6b90b', venueName: true },
    { kind: 'sign', at: [-4.48, -0.2], rot: 90, y: 1.6, wall: true, size: [1.3, 0.8], lines: ['NO PHONES', 'NO CALCULATORS', 'NO WAHALA'], bg: '#ffffff', fg: '#c62828', accent: '#1d4e89', style: 'poster' },
    { kind: 'sign', at: [-2.4, -3.48], y: 1.75, wall: true, size: [0.9, 0.45], lines: ['SERVER DOWN?', 'PLEASE WAIT'], bg: '#fff3cd', fg: '#7a4a00' },
    { kind: 'aircon', at: [2.2, -3.48], y: 2.45 },
    { kind: 'water-dispenser', at: [4.1, -3.1], rot: -90 },
  ],
  player: {
    default: stand([3.6, 2.6], 220),
    type: seat([0.25, 0.05], 90, 'type', { props: false }),
    sit: seat([0.25, 0.05], 90, 'sit', { props: false }),
    read: seat([0.25, 0.05], 90, 'read', { props: false }),
  },
  npcs: [
    npc(stand([-3.0, -1.4], 60, 'talk'), 'corporate'),
    ...gridPoints(3, 4, [0.4, -0.6], [2.0, 1.3])
      .filter((_, i) => i !== 7)
      .slice(0, 9)
      .map(([x, z], i): NpcSpot => npc(seat([x - 0.15, z], 90, i % 4 === 3 ? 'phone' : 'type', { props: false }), 'campus')),
  ],
  guests: [seat([2.25, 1.35], 90, 'type', { props: false })],
  lighting: { mood: 'office', practicals: [[0.0, 2.5, -1.0], [0.0, 2.5, 1.6]] },
};

/** Open-plan office (Yaba tech hub / Marina): desk pods, meeting table, whiteboard, plants. */
export const OFFICE: InteriorTemplate = {
  id: 'office',
  label: 'Office',
  room: {
    width: 10,
    depth: 7,
    height: 2.9,
    floor: 'carpet',
    floorColor: '#5f6b73',
    wall: { style: 'paint', color: '#eef0ee', band: '#13606b' },
    windows: [{ wall: 'back', at: 0.4, width: 2.4, sill: 0.6, height: 1.8, bars: false }, { wall: 'back', at: 3.4, width: 2.0, sill: 0.6, height: 1.8, bars: false }, { wall: 'left', at: 1.6, width: 2.0, sill: 0.6, height: 1.8, bars: false }],
    doors: [{ wall: 'left', at: -1.6, width: 1.0 }],
  },
  furniture: [
    ...gridPoints(2, 3, [0.6, -0.2], [2.4, 1.4]).flatMap(([x, z]): FurniturePlacement[] => [
      place('desk', [x + 0.42, z], -90, { palette: { wood: '#f4f4f2', metal: '#2b2f33' } }),
      place('computerScreen', [x + 0.55, z], -90, { y: 0.57 }),
      place('computerKeyboard', [x + 0.25, z], -90, { y: 0.57 }),
      place('chairDesk', [x - 0.2, z], 90, { palette: { carpet: '#13606b' } }),
    ]),
    place('tableGlass', [-3.0, -2.2], 0, { scale: 1.3 }),
    ...row('chairModernCushion', 2, [-3.35, -1.55], [0.7, 0], 180, { palette: { carpetBlue: '#f6b90b' } }),
    place('chairModernCushion', [-3.95, -2.2], 90, { palette: { carpetBlue: '#f6b90b' } }),
    place('loungeDesignSofa', [-4.5, 2.3], 90, { palette: { carpetBlue: '#f6b90b' } }),
    place('tableCoffeeSquare', [-3.6, 2.3]),
    place('pottedPlant', [-4.6, -3.2], 0, { scale: 1.3 }),
    place('pottedPlant', [4.6, -3.2], 0, { scale: 1.3 }),
    place('pottedPlant', [-4.6, 0.6], 0, { scale: 1.2 }),
    place('kitchenCoffeeMachine', [4.6, 1.4], -90, { y: 0.68 }),
    place('kitchenCabinet', [4.6, 1.4], -90),
  ],
  props: [
    { kind: 'sign', at: [-3.0, -3.48], y: 1.55, wall: true, size: [2.0, 1.0], lines: ['Q3 GOALS', '• Ship the app', '• Fix NEPA wahala'], bg: '#ffffff', fg: '#13606b', frame: '#c0c6cc', style: 'board' },
    { kind: 'sign', at: [-4.98, 2.3], rot: 90, y: 1.9, wall: true, size: [1.8, 0.45], lines: ['YABA TECH HUB'], bg: '#0e2733', fg: '#f6b90b', venueName: true },
    { kind: 'water-dispenser', at: [4.6, 0.4], rot: -90 },
    { kind: 'aircon', at: [1.9, -3.48], y: 2.55 },
  ],
  player: {
    default: stand([2.6, 2.6], 210),
    type: seat([0.4, -1.6], 90, 'type', { props: false }),
    sit: seat([0.4, -1.6], 90, 'sit', { props: false }),
    read: seat([0.4, -1.6], 90, 'read'),
    phone: seat([0.4, -1.6], 90, 'phone'),
    talk: seat([-3.35, -1.55], 180, 'talk'),
    eat: seat([0.4, -1.6], 90, 'eat'),
  },
  npcs: [
    npc(seat([-1.6, -1.6], 90, 'type', { props: false }), 'corporate'),
    npc(seat([-1.6, -0.2], 90, 'type', { props: false }), 'campus'),
    npc(seat([0.8, -0.2], 90, 'phone'), 'corporate'),
    npc(seat([-1.6, 1.2], 90, 'type', { props: false }), 'street'),
    npc(seat([-2.65, -1.55], 180, 'talk'), 'corporate', { lod: 'low' }),
    npc(stand([4.0, 1.0], -90, 'talk'), 'casual', { lod: 'low' }),
  ],
  guests: [seat([0.8, 1.2], 90, 'type', { props: false }), seat([-4.4, 2.0], 90, 'talk'), stand([2.8, 2.8], 210, 'talk')],
  lighting: { mood: 'office', practicals: [[-0.6, 2.6, -0.4], [-3.0, 2.6, -2.0]] },
};

/** Government office: queue bench, enquiries counter, files everywhere, the flag — and Oga is not on seat. */
export const GOVERNMENT: InteriorTemplate = {
  id: 'government',
  label: 'Government office',
  room: {
    width: 9,
    depth: 6.6,
    height: 3,
    floor: 'terrazzo',
    floorColor: '#bfb8a8',
    wall: { style: 'paint', color: '#e4ead8', band: '#2e7d32' },
    windows: [{ wall: 'back', at: -1.2, width: 1.4 }, { wall: 'back', at: 1.6, width: 1.4 }],
    doors: [{ wall: 'left', at: 1.6, width: 1.1 }],
  },
  furniture: [
    place('desk', [-1.8, -2.4], 0, { palette: { wood: '#6d4c41' } }),
    place('chairDesk', [-1.8, -2.9], 0),
    place('computerScreen', [-1.95, -2.5], 0, { y: 0.57 }),
    place('desk', [1.6, -2.4], 0, { palette: { wood: '#6d4c41' } }),
    place('chairDesk', [1.6, -2.9], 0),
    place('televisionVintage', [1.3, -2.55], 15, { y: 0.57 }),
    ...row('cardboardBoxClosed', 3, [3.9, -2.9], [0, 0.4], -90),
    place('cardboardBoxOpen', [3.4, -2.95], 20),
    place('bookcaseClosed', [-4.25, -2.4], 90, { palette: { wood: '#6d4c41' } }),
    place('bookcaseClosed', [-4.25, -1.8], 90, { palette: { wood: '#6d4c41' } }),
    place('ceilingFan', [0.0, 0.0], 0, { y: 2.75 }),
  ],
  props: [
    { kind: 'bar-counter', at: [0.0, -1.2], length: 6.4, color: '#5d4037', top: '#d7ccc8' },
    { kind: 'bench', at: [0.2, 1.6], length: 2.6, color: '#8d6e63' },
    { kind: 'bench', at: [-2.8, 1.6], length: 2.0, color: '#8d6e63' },
    { kind: 'sign', at: [-1.8, -3.28], y: 2.15, wall: true, size: [1.4, 0.38], lines: ['ENQUIRIES'], bg: '#2e7d32', fg: '#ffffff' },
    { kind: 'sign', at: [1.6, -3.28], y: 2.15, wall: true, size: [1.4, 0.38], lines: ['REGISTRY'], bg: '#2e7d32', fg: '#ffffff' },
    { kind: 'sign', at: [0.0, -3.28], y: 1.45, wall: true, size: [0.9, 0.5], lines: ['OGA IS NOT', 'ON SEAT'], bg: '#fff8e1', fg: '#b71c1c', style: 'poster' },
    { kind: 'sign', at: [-4.48, 0.6], rot: 90, y: 1.7, wall: true, size: [1.2, 0.7], lines: ['NO BRIBE', 'NO SERVICE CHARGE', 'REPORT TO ICPC'], bg: '#ffffff', fg: '#1b5e20', accent: '#c62828', style: 'poster' },
    { kind: 'sign', at: [-4.48, -1.6], rot: 90, y: 2.3, wall: true, size: [2.4, 0.5], lines: ['ALAUSA SECRETARIAT'], bg: '#1b5e20', fg: '#ffffff', venueName: true },
    { kind: 'flag', at: [-3.6, -2.9] },
    { kind: 'standing-fan', at: [3.8, 1.8], rot: -130 },
  ],
  player: {
    default: stand([1.6, 0.4], 200),
    sit: seat([0.2, 1.62], 0),
    phone: seat([0.2, 1.62], 0, 'phone'),
    read: seat([0.2, 1.62], 0, 'read'),
    talk: stand([-1.8, -0.55], 180, 'talk'),
    drive: seat([0.2, 1.62], 0, 'drive'),
  },
  npcs: [
    npc(seat([-1.8, -2.9], 0, 'type', { props: false }), 'corporate', { gender: 'female' }),
    npc(seat([-0.7, 1.62], 0, 'phone'), 'casual'),
    npc(seat([-3.2, 1.62], 0, 'sit'), 'market', { lod: 'low' }),
    npc(seat([1.0, 1.62], 0, 'sit'), 'worship', { lod: 'low' }),
    npc(stand([2.6, 0.2], 200, 'phone'), 'corporate', { lod: 'low' }),
  ],
  guests: [seat([-2.3, 1.62], 0, 'sit'), stand([3.2, 0.6], 220, 'talk')],
  lighting: { mood: 'office', practicals: [[0.0, 2.7, -0.4]], practicalColor: '#f8f6e8' },
};

/** Estate agency: listings on the wall, a model house, a smooth agent. */
export const ESTATE_AGENCY: InteriorTemplate = {
  id: 'estate-agency',
  label: 'Estate agency',
  room: {
    width: 8,
    depth: 6,
    height: 2.9,
    floor: 'wood',
    floorColor: '#c49a6c',
    wall: { style: 'paint', color: '#f4efe6', band: '#13606b' },
    windows: [{ wall: 'back', at: 1.8, width: 1.8, sill: 0.6, height: 1.7, bars: false }],
    doors: [{ wall: 'left', at: 1.4, width: 1.1 }],
  },
  furniture: [
    place('desk', [-0.6, -1.9], 0, { scale: 1.2, palette: { wood: '#3e2723' } }),
    place('chairDesk', [-0.6, -2.5], 0),
    place('laptop', [-0.8, -2.0], 0, { y: 0.69 }),
    place('chairModernCushion', [-1.0, -1.1], 180, { palette: { carpetBlue: '#13606b' } }),
    place('chairModernCushion', [-0.2, -1.1], 180, { palette: { carpetBlue: '#13606b' } }),
    place('loungeSofa', [-3.6, 1.2], 90, { palette: { carpet: '#13606b', carpetDarker: '#0e4b54' } }),
    place('tableCoffee', [-2.6, 1.2], 90),
    place('pottedPlant', [-3.7, -2.5], 0, { scale: 1.3 }),
    place('pottedPlant', [3.6, -2.5], 0, { scale: 1.3 }),
    place('bookcaseOpenLow', [2.0, -2.75], 0),
  ],
  props: [
    { kind: 'sign', at: [-2.6, -2.98], y: 1.55, wall: true, size: [0.9, 0.7], lines: ['3-BED FLAT', 'LEKKI PHASE 1', '₦3.5M / YR'], bg: '#ffffff', fg: '#0e2733', accent: '#c8287a', style: 'poster' },
    { kind: 'sign', at: [-1.5, -2.98], y: 1.55, wall: true, size: [0.9, 0.7], lines: ['LAND 600SQM', 'IBEJU-LEKKI', 'C OF O ✓'], bg: '#ffffff', fg: '#0e2733', accent: '#0f8a4f', style: 'poster' },
    { kind: 'sign', at: [0.4, -2.98], y: 1.55, wall: true, size: [0.9, 0.7], lines: ['SELF-CONTAIN', 'YABA', '₦650K / YR'], bg: '#ffffff', fg: '#0e2733', accent: '#f6b90b', style: 'poster' },
    { kind: 'sign', at: [-3.98, -0.6], rot: 90, y: 2.05, wall: true, size: [2.0, 0.42], lines: ['LEKKI HOMES & LAND'], bg: '#13606b', fg: '#ffffff', venueName: true },
    { kind: 'box', at: [2.4, 0.4], size: [0.9, 0.62, 0.9], color: '#f4efe6', surface: 'paint' },
    { kind: 'box', at: [2.4, 0.4], y: 0.62, size: [0.5, 0.3, 0.42], color: '#e8d6b5', surface: 'paint' },
    { kind: 'box', at: [2.4, 0.4], y: 0.92, size: [0.56, 0.08, 0.48], color: '#b23a2b', surface: 'paint' },
    { kind: 'water-dispenser', at: [3.6, 1.6], rot: -90 },
  ],
  player: {
    default: stand([1.2, 1.4], 210),
    sit: seat([-1.0, -1.1], 180),
    talk: seat([-1.0, -1.1], 180, 'talk'),
    phone: seat([-3.5, 1.4], 90, 'phone'),
    read: seat([-3.5, 1.4], 90, 'read'),
  },
  npcs: [npc(seat([-0.6, -2.5], 0, 'talk'), 'corporate', { gender: 'male' }), npc(seat([-3.5, 0.9], 90, 'phone'), 'casual', { lod: 'low' })],
  guests: [seat([-0.2, -1.1], 180, 'talk'), stand([1.6, 1.8], 220, 'talk')],
  lighting: { mood: 'shop', practicals: [[-0.6, 2.6, -1.0], [2.0, 2.6, 0.8]] },
};
