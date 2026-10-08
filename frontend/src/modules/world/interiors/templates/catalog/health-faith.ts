import type { PropSpec } from '../../props/prop-types';
import { bed, gridPoints, npc, place, row, seat, stand } from '../helpers';
import type { FurniturePlacement, InteriorTemplate, NpcSpot } from '../types';

const WARD_BED = { carpet: '#e3f2fd', carpetDarker: '#90caf9', carpetWhite: '#ffffff', wood: '#cfd8dc', metal: '#b0bec5' } as const;

/** LUTH-style public ward: two rows of beds with drips and curtains, a nurses' station. */
export const HOSPITAL_WARD: InteriorTemplate = {
  id: 'hospital-ward',
  label: 'Hospital ward',
  room: {
    width: 10,
    depth: 7,
    height: 3,
    floor: 'terrazzo',
    floorColor: '#cfd6d2',
    wall: { style: 'tiles', color: '#e8f1ef', band: '#bfe1d8' },
    windows: [{ wall: 'back', at: -2.6, width: 1.3 }, { wall: 'back', at: 0.4, width: 1.3 }, { wall: 'back', at: 3.4, width: 1.3 }],
    doors: [{ wall: 'left', at: 2.2, width: 1.2 }],
    curtain: '#7fb7c9',
  },
  furniture: [
    ...[-3.6, -1.1, 1.9].map((x): FurniturePlacement => place('bedSingle', [x, -2.25], 0, { palette: WARD_BED })),
    ...[-3.6, -1.1, 1.9].map((x): FurniturePlacement => place('cabinetBed', [x + 0.75, -2.95], 0, { palette: { wood: '#eceff1' } })),
    ...[-1.1, 1.9].map((x): FurniturePlacement => place('bedSingle', [x, 1.4], 180, { palette: WARD_BED })),
    place('chair', [-0.25, -1.6], -90),
    place('desk', [-3.9, 1.5], 90, { palette: { wood: '#eceff1' } }),
    place('chairDesk', [-4.4, 1.5], 90),
    place('computerScreen', [-3.9, 1.3], 90, { y: 0.57 }),
    place('kitchenFridgeSmall', [-4.6, 2.9], 90),
    place('trashcan', [4.6, 3.2]),
  ],
  props: [
    { kind: 'iv-stand', at: [-2.95, -2.5] },
    { kind: 'iv-stand', at: [-0.45, -2.5] },
    { kind: 'iv-stand', at: [2.55, -2.5] },
    { kind: 'iv-stand', at: [-0.45, 1.65] },
    { kind: 'curtain', at: [-2.35, -2.25], rot: 90, length: 1.6, color: '#a5d6c9', height: 2.0 },
    { kind: 'curtain', at: [0.4, -2.25], rot: 90, length: 1.6, color: '#a5d6c9', height: 2.0 },
    { kind: 'curtain', at: [0.4, 1.4], rot: 90, length: 1.6, color: '#a5d6c9', height: 2.0 },
    { kind: 'sign', at: [0.0, -3.48], y: 2.55, wall: true, size: [3.2, 0.4], lines: ['WARD C • FEMALE MEDICAL'], bg: '#0f8a4f', fg: '#ffffff' },
    { kind: 'sign', at: [-4.98, -0.6], rot: 90, y: 1.7, wall: true, size: [0.9, 0.9], lines: ['WASH YOUR', 'HANDS', '🧼 SAVE LIVES'], bg: '#ffffff', fg: '#13606b', accent: '#0f8a4f', style: 'poster' },
    { kind: 'sign', at: [-4.98, 1.5], rot: 90, y: 2.2, wall: true, size: [1.4, 0.36], lines: ['NURSES STATION'], bg: '#13606b', fg: '#ffffff' },
    { kind: 'water-dispenser', at: [4.5, -2.9], rot: -90 },
  ],
  player: {
    default: stand([3.6, 1.6], 220),
    sleep: bed([-1.1, -2.25]),
    sit: seat([-0.25, -1.6], -90),
    phone: seat([-0.25, -1.6], -90, 'phone'),
    talk: stand([-2.9, 0.4], 30, 'talk'),
  },
  npcs: [
    npc(bed([-3.6, -2.25]), 'casual', { gender: 'female' }),
    npc(bed([1.9, -2.25]), 'market', { gender: 'female', lod: 'low' }),
    npc(bed([1.9, 1.4], 180), 'casual', { gender: 'female', lod: 'low' }),
    npc(stand([-2.9, -0.9], 200, 'talk'), 'medic', { gender: 'female' }),
    npc(seat([-4.4, 1.5], 90, 'type', { props: false }), 'medic', { gender: 'male' }),
    npc(stand([3.2, -0.6], 230, 'phone'), 'medic', { lod: 'low' }),
  ],
  guests: [stand([0.9, -0.6], 210, 'talk'), stand([2.6, 0.4], 230, 'idle')],
  lighting: { mood: 'clinic', practicals: [[-1.0, 2.7, -1.0], [2.0, 2.7, 1.0]] },
};

/** Private clinic: a calm consulting room with an exam bed and a waiting corner. */
export const CLINIC: InteriorTemplate = {
  id: 'clinic',
  label: 'Private clinic',
  room: {
    width: 8,
    depth: 6,
    height: 2.9,
    floor: 'tiles',
    floorColor: '#dfe9e7',
    wall: { style: 'paint', color: '#f4f8f7', band: '#7fb7c9' },
    windows: [{ wall: 'back', at: 1.6, width: 1.6, bars: false }],
    doors: [{ wall: 'left', at: 1.6, width: 1.0 }],
    curtain: '#d8eef3',
  },
  furniture: [
    place('bedSingle', [-2.8, -1.9], 90, { palette: WARD_BED }),
    place('desk', [1.1, -1.9], 0, { palette: { wood: '#eceff1' } }),
    place('chairDesk', [1.1, -2.5], 0),
    place('laptop', [0.9, -2.0], 0, { y: 0.57 }),
    place('chairModernCushion', [0.7, -1.2], 180, { palette: { carpetBlue: '#13606b' } }),
    ...row('chairModernCushion', 3, [-3.6, 1.0], [0, 0.62], 90, { palette: { carpetBlue: '#7fb7c9' } }),
    place('tableCoffeeGlass', [-2.7, 1.6], 90, { scale: 0.8 }),
    place('pottedPlant', [3.6, -2.6], 0, { scale: 1.2 }),
    place('bookcaseClosedDoors', [3.65, -0.9], -90, { palette: { wood: '#eceff1', woodDark: '#cfd8dc' } }),
  ],
  props: [
    { kind: 'iv-stand', at: [-3.6, -2.6] },
    { kind: 'curtain', at: [-1.7, -1.9], rot: 90, length: 1.9, color: '#b2dfdb', height: 2.0 },
    { kind: 'sign', at: [-1.2, -2.98], y: 2.3, wall: true, size: [2.4, 0.4], lines: ['BODE THOMAS CLINIC'], bg: '#13606b', fg: '#ffffff' },
    { kind: 'sign', at: [-3.98, 1.6], rot: 90, y: 1.65, wall: true, size: [0.9, 0.7], lines: ['HMO', 'ACCEPTED HERE'], bg: '#ffffff', fg: '#13606b', accent: '#0f8a4f', style: 'poster' },
    { kind: 'water-dispenser', at: [3.6, 1.6], rot: -90 },
  ],
  player: {
    default: stand([1.6, 1.4], 210),
    sleep: bed([-2.8, -1.9], 90),
    sit: seat([0.7, -1.2], 180),
    talk: seat([0.7, -1.2], 180, 'talk'),
    phone: seat([-3.5, 1.62], 90, 'phone'),
  },
  npcs: [npc(seat([1.1, -2.5], 0, 'talk'), 'medic'), npc(seat([-3.5, 1.0], 90, 'phone'), 'casual'), npc(stand([-1.9, -0.8], 200, 'idle'), 'medic', { gender: 'female', lod: 'low' })],
  guests: [seat([-3.5, 2.24], 90, 'sit'), stand([2.6, 1.0], 230, 'talk')],
  lighting: { mood: 'clinic', practicals: [[0.0, 2.6, -0.6]] },
};

/** Neighbourhood pharmacy: shelves of drugs, a counter, a pharmacist with opinions. */
export const PHARMACY: InteriorTemplate = {
  id: 'pharmacy',
  label: 'Pharmacy',
  room: {
    width: 7,
    depth: 5.4,
    height: 2.8,
    floor: 'tiles',
    floorColor: '#e6e9e8',
    wall: { style: 'paint', color: '#f1f8f3', band: '#0f8a4f' },
    doors: [{ wall: 'left', at: 1.4, width: 1.1 }],
  },
  furniture: [place('pottedPlant', [3.2, 2.3]), place('stoolBar', [0.6, 0.7], 180), place('chair', [-2.9, 1.8], 90)],
  props: [
    { kind: 'shelf', at: [-1.6, -2.45], size: [2.4, 2.0, 0.4], items: 'drugs', color: '#eceff1' },
    { kind: 'shelf', at: [1.2, -2.45], size: [2.4, 2.0, 0.4], items: 'drugs', color: '#eceff1' },
    { kind: 'shelf', at: [-3.25, -0.6], rot: 90, size: [2.0, 1.8, 0.4], items: 'boxes', color: '#eceff1' },
    { kind: 'bar-counter', at: [0.0, -0.4], length: 4.2, color: '#0f8a4f', top: '#f4f4f2' },
    { kind: 'sign', at: [0.0, -2.68], y: 2.45, wall: true, size: [3.4, 0.4], lines: ['IYA OLOOGUN PHARMACY'], bg: '#0f8a4f', fg: '#ffffff', accent: '#e2412e' },
    { kind: 'sign', at: [-3.48, 1.4], rot: 90, y: 1.7, wall: true, size: [0.9, 0.7], lines: ['NO PRESCRIPTION', 'NO ANTIBIOTICS'], bg: '#ffffff', fg: '#c62828', style: 'poster' },
    { kind: 'sign', at: [2.0, -0.4], y: 0.95, size: [0.5, 0.3], lines: ['MALARIA? ASK ME'], bg: '#fff3cd', fg: '#7a4a00' },
    { kind: 'water-dispenser', at: [3.1, -1.6], rot: -90 },
  ],
  player: {
    default: stand([0.6, 0.9], 180),
    talk: stand([0.6, 0.9], 180, 'talk'),
    sit: seat([-2.9, 1.8], 90),
    phone: stand([1.8, 1.4], 200, 'phone'),
  },
  npcs: [npc(stand([0.2, -1.3], 0, 'talk'), 'medic', { gender: 'female' }), npc(stand([-1.4, 0.8], 160, 'phone'), 'market')],
  guests: [stand([2.0, 1.2], 210, 'idle'), seat([-2.9, 1.8], 90, 'sit')],
  lighting: { mood: 'shop', practicals: [[0.0, 2.5, -1.0]], practicalColor: '#f2fff6' },
};

/** Church: pews facing the altar on the left wall, cross, pulpit, choir corner. */
export const CHURCH: InteriorTemplate = {
  id: 'church',
  label: 'Church',
  room: {
    width: 11,
    depth: 8,
    height: 3.6,
    floor: 'tiles',
    floorColor: '#d8cfc0',
    wall: { style: 'paint', color: '#f5efe2', band: '#7b2d3b' },
    windows: [{ wall: 'back', at: -1.0, width: 1.0, sill: 1.0, height: 2.0 }, { wall: 'back', at: 1.4, width: 1.0, sill: 1.0, height: 2.0 }, { wall: 'back', at: 3.8, width: 1.0, sill: 1.0, height: 2.0 }],
    doors: [{ wall: 'back', at: 4.8, width: 1.2 }],
    curtain: '#c9a227',
  },
  furniture: [place('pottedPlant', [-5.0, -3.4], 0, { scale: 1.4 }), place('pottedPlant', [-5.0, 3.4], 0, { scale: 1.4 }), place('speaker', [-4.7, -2.4], 60), place('speaker', [-4.7, 2.4], 120)],
  props: [
    { kind: 'stage', at: [-4.3, 0.0], size: [2.2, 6.4], height: 0.35, color: '#7b2d3b', trim: '#c9a227' },
    { kind: 'cross', at: [-5.45, 0.0], rot: 90, y: 2.3, color: '#c9a227' },
    { kind: 'lectern', at: [-4.0, 0.0], rot: 90, y: 0.35, color: '#5d4037' },
    { kind: 'sign', at: [-5.48, -2.2], rot: 90, y: 2.7, wall: true, size: [1.9, 0.4], lines: ['GRACE ASSEMBLY'], bg: '#7b2d3b', fg: '#f3d27a' },
    { kind: 'sign', at: [-5.48, 2.2], rot: 90, y: 2.7, wall: true, size: [1.9, 0.4], lines: ['JESUS SAVES'], bg: '#7b2d3b', fg: '#f3d27a' },
    { kind: 'sign', at: [0.6, -3.98], y: 2.9, wall: true, size: [2.6, 0.36], lines: ['SUNDAY SERVICE 8AM & 10AM'], bg: '#f3d27a', fg: '#7b2d3b' },
    ...gridPoints(4, 2, [0.6, 0.0], [1.1, 3.2]).map(([x, z]): PropSpec => ({ kind: 'pew', at: [x, z], rot: -90, length: 2.6, color: '#6b4226' })),
    { kind: 'plastic-chair', at: [-3.6, -2.9], rot: 90, color: '#ecebe6' },
    { kind: 'plastic-chair', at: [-3.6, 2.9], rot: 90, color: '#ecebe6' },
  ],
  player: {
    default: stand([3.4, 2.4], 240),
    pray: { at: [1.65, 1.0], rot: -90, animation: 'pray', stance: 'kneel' },
    sit: seat([1.15, 1.0], -90),
    talk: seat([1.15, 1.0], -90, 'talk'),
    dance: stand([-2.6, 2.6], 60, 'dance'),
    cheer: stand([-2.6, 2.6], 60, 'cheer'),
  },
  npcs: [
    npc(stand([-4.0, -0.6], 90, 'talk'), 'worship', { gender: 'male' }),
    ...gridPoints(4, 2, [0.6, 0.0], [1.1, 3.2])
      .flatMap(([x, z]) => [[x, z - 0.6] as const, [x, z + 0.6] as const])
      .filter((_, i) => i % 3 !== 2 && !(i === 13))
      .slice(0, 9)
      .map(([x, z], i): NpcSpot => npc(i % 4 === 1 ? { at: [x + 0.45, z], rot: -90, animation: 'pray', stance: 'stand' } : seat([x, z], -90, i % 4 === 3 ? 'cheer' : 'sit'), 'worship', { lod: i < 3 ? 'high' : 'low' })),
  ],
  guests: [seat([2.25, 1.0], -90, 'sit'), seat([2.25, -2.2], -90, 'sit')],
  lighting: { mood: 'worship', practicals: [[-3.6, 3.2, 0.0], [1.4, 3.2, 0.0]] },
};

/** Mosque: rows of prayer mats facing the mihrab, calm and respectful. */
export const MOSQUE: InteriorTemplate = {
  id: 'mosque',
  label: 'Mosque',
  room: {
    width: 10,
    depth: 8,
    height: 3.6,
    floor: 'carpet',
    floorColor: '#2f6b4a',
    wall: { style: 'paint', color: '#f4f1e6', band: '#c9b48a' },
    windows: [{ wall: 'back', at: -0.6, width: 1.0, sill: 1.1, height: 1.8, bars: false }, { wall: 'back', at: 2.0, width: 1.0, sill: 1.1, height: 1.8, bars: false }],
    doors: [{ wall: 'back', at: 4.2, width: 1.2 }],
  },
  furniture: [place('pottedPlant', [4.6, 3.4], 0, { scale: 1.3 })],
  props: [
    { kind: 'arch', at: [-4.92, 0.0], rot: 90, width: 1.5, height: 2.6, color: '#f4f1e6', trim: '#c9a227' },
    { kind: 'stairs', at: [-4.45, 1.5], size: [0.6, 0.9, 0.9], rot: -90, color: '#8d6e63' },
    { kind: 'sign', at: [-4.98, -2.2], rot: 90, y: 2.7, wall: true, size: [1.6, 0.4], lines: ['LAGOS CENTRAL MOSQUE'], bg: '#2f6b4a', fg: '#f3d27a' },
    { kind: 'sign', at: [0.8, -3.98], y: 2.9, wall: true, size: [2.2, 0.36], lines: ['JUMU’AH 1:30PM'], bg: '#f3d27a', fg: '#2f6b4a' },
    ...gridPoints(3, 5, [0.2, 0.0], [1.5, 1.2]).map(([x, z]): PropSpec => ({ kind: 'mat', at: [x, z], size: [1.1, 0.62], color: '#7b2d3b', border: '#c9a227' })),
    // Women's rows at the back, behind a low screen.
    ...gridPoints(1, 4, [3.6, 0.6], [1.5, 1.2]).map(([x, z]): PropSpec => ({ kind: 'mat', at: [x, z], size: [1.1, 0.62], color: '#2f5d8a', border: '#c9a227' })),
    { kind: 'box', at: [2.75, 0.6], size: [0.06, 0.9, 4.6], color: '#d8cfbd', surface: 'wood', round: 0.1 },
    { kind: 'shelf', at: [4.6, -2.6], rot: -90, size: [1.6, 0.9, 0.35], items: 'boxes', color: '#8d6e63' },
  ],
  player: {
    default: stand([1.9, 3.4], 230),
    pray: { at: [0.2, -1.2], rot: -90, animation: 'pray', stance: 'kneel' },
    sit: { at: [0.2, -1.2], rot: -90, animation: 'sit', stance: 'kneel' },
    read: { at: [0.2, -1.2], rot: -90, animation: 'read', stance: 'kneel' },
    talk: stand([1.9, 3.4], 230, 'talk'),
  },
  npcs: [
    ...gridPoints(3, 5, [0.2, 0.0], [1.5, 1.2])
      .filter((_, i) => i !== 1 * 3 + 1 && i % 2 === 0)
      .slice(0, 7)
      .map(([x, z], i): NpcSpot => npc({ at: [x, z], rot: -90, animation: i % 3 === 2 ? 'read' : 'pray', stance: 'kneel' }, 'mosque', { gender: 'male' })),
    npc({ at: [-4.0, 0.0], rot: 90, animation: 'pray', stance: 'stand' }, 'mosque', { gender: 'male' }),
    ...gridPoints(1, 4, [3.6, 0.6], [1.5, 1.2])
      .slice(0, 3)
      .map(([x, z], i): NpcSpot => npc({ at: [x, z], rot: -90, animation: i === 1 ? 'read' : 'pray', stance: 'kneel' }, 'mosque', { gender: 'female', lod: i === 0 ? 'high' : 'low' })),
  ],
  guests: [{ at: [1.7, 1.2], rot: -90, animation: 'pray', stance: 'kneel' }, { at: [-1.3, -1.2], rot: -90, animation: 'pray', stance: 'kneel' }],
  lighting: { mood: 'worship', practicals: [[-3.4, 3.2, 0.0], [1.4, 3.2, 0.0]], practicalColor: '#fff1d0' },
};

/** Gym: treadmills, free weights, a heavy bag and motivational shouting on the walls. */
export const GYM: InteriorTemplate = {
  id: 'gym',
  label: 'Gym',
  room: {
    width: 10,
    depth: 7,
    height: 3,
    floor: 'dark',
    floorColor: '#2a2d30',
    wall: { style: 'brick', color: '#7a4a3a' },
    windows: [{ wall: 'back', at: 2.8, width: 1.8, bars: false }],
    doors: [{ wall: 'left', at: 2.4, width: 1.1 }],
  },
  furniture: [place('speaker', [4.6, -3.1], -45), place('speaker', [-4.6, 3.1], 45), place('trashcan', [4.6, 3.1])],
  props: [
    ...[-3.4, -2.4, -1.4].map((x): PropSpec => ({ kind: 'treadmill', at: [x, -2.5], rot: 180 })),
    { kind: 'bench-press', at: [1.2, -1.6], rot: 90 },
    { kind: 'dumbbell-rack', at: [-4.65, 0.2], rot: 90 },
    { kind: 'punching-bag', at: [3.6, 0.6] },
    { kind: 'mat', at: [0.6, 1.6], size: [3.0, 2.0], color: '#1d1f22', border: '#f6b90b' },
    { kind: 'mirror', at: [-4.9, 2.0], rot: 90, y: 1.45, size: [2.0, 1.4], frame: '#2b2f33' },
    { kind: 'sign', at: [0.6, -3.48], y: 2.4, wall: true, size: [3.4, 0.5], lines: ['IRON PARADISE • NO PAIN NO GAIN'], bg: '#111315', fg: '#f6b90b', accent: '#e2412e' },
    { kind: 'sign', at: [-4.98, -1.6], rot: 90, y: 2.0, wall: true, size: [1.1, 0.8], lines: ['LEG DAY', 'IS NOT', 'OPTIONAL'], bg: '#e2412e', fg: '#ffffff', style: 'poster' },
    { kind: 'water-dispenser', at: [4.6, -1.4], rot: -90 },
  ],
  player: {
    default: stand([2.2, 2.4], 220),
    exercise: stand([0.6, 1.6], 30, 'exercise'),
    sit: seat([1.2, -1.45], 90, 'sit', { y: 0.1 }),
    phone: stand([2.2, 2.4], 220, 'phone'),
    run: { at: [-2.4, 0.16, -2.55], rot: 0, animation: 'run' },
    walk: { at: [-2.4, 0.16, -2.55], rot: 0, animation: 'walk' },
  },
  npcs: [
    npc({ at: [-3.4, 0.16, -2.55], rot: 0, animation: 'run' }, 'gym'),
    npc({ at: [-1.4, 0.16, -2.55], rot: 0, animation: 'walk' }, 'gym', { gender: 'female' }),
    npc(stand([3.0, 0.6], 90, 'exercise'), 'gym', { gender: 'male' }),
    npc(stand([-0.6, 1.4], 40, 'exercise'), 'gym', { gender: 'female' }),
    npc(stand([-3.9, 0.9], 70, 'talk'), 'gym', { lod: 'low' }),
  ],
  guests: [stand([1.8, 1.0], 30, 'exercise'), stand([-0.4, 2.6], 20, 'exercise')],
  lighting: { mood: 'office', practicals: [[-1.0, 2.7, -1.0], [2.0, 2.7, 1.0]], practicalColor: '#f4f8ff' },
};

/** Cinema: stepped rows facing a glowing screen on the left wall; popcorn on the side. */
export const CINEMA: InteriorTemplate = {
  id: 'cinema',
  label: 'Cinema',
  room: {
    width: 10,
    depth: 7.6,
    height: 3.4,
    floor: 'carpet',
    floorColor: '#3a1d2b',
    wall: { style: 'panel', color: '#2a1520' },
    doors: [{ wall: 'back', at: 4.0, width: 1.1 }],
  },
  furniture: [place('kitchenBar', [4.2, 2.2], -90, { palette: { wood: '#c62828' } }), place('kitchenBar', [4.2, 2.86], -90, { palette: { wood: '#c62828' } })],
  props: [
    { kind: 'sign', at: [-4.92, 0.0], rot: 90, y: 1.85, wall: true, size: [5.6, 2.4], lines: ['A NOLLYWOOD PREMIERE', 'KING OF BOYS: THE RETURN', 'IN CINEMAS NOW'], bg: '#101010', fg: '#f6b90b', accent: '#ff2fb1', style: 'screen' },
    ...[-1.4, 0.4, 2.2].flatMap((x, i): PropSpec[] => [
      { kind: 'stage', at: [x, 0.0], size: [1.4, 6.2], height: 0.12 * i + 0.01, color: '#2a1520', trim: '#c62828' },
      { kind: 'seat-row', at: [x, -1.55], y: 0.12 * i, rot: -90, count: 5, color: '#b71c1c', frame: '#1c1c1c' },
      { kind: 'seat-row', at: [x, 1.55], y: 0.12 * i, rot: -90, count: 5, color: '#b71c1c', frame: '#1c1c1c' },
    ]),
    { kind: 'sign', at: [4.2, 2.55], y: 1.15, size: [0.8, 0.4], lines: ['POPCORN • ZOBO'], bg: '#f6b90b', fg: '#7b1c1c' },
  ],
  player: {
    default: stand([3.6, 1.2], 240),
    sit: seat([0.4, -0.99], -90, 'sit', { y: 0.12 }),
    eat: seat([0.4, -0.99], -90, 'eat', { y: 0.12 }),
    phone: seat([0.4, -0.99], -90, 'phone', { y: 0.12 }),
  },
  npcs: [
    npc(seat([-1.4, -2.11], -90, 'sit', { y: 0.01 }), 'casual'),
    npc(seat([-1.4, 0.99], -90, 'eat', { y: 0.01 }), 'street'),
    npc(seat([0.4, -1.55], -90, 'sit', { y: 0.12 }), 'club', { gender: 'female' }),
    npc(seat([0.4, 2.11], -90, 'sit', { y: 0.12 }), 'casual', { lod: 'low' }),
    npc(seat([2.2, -0.43], -90, 'phone', { y: 0.24 }), 'campus', { lod: 'low' }),
    npc(stand([3.6, 2.5], 90, 'talk'), 'casual', { lod: 'low' }),
  ],
  guests: [seat([0.4, -0.43], -90, 'sit', { y: 0.12 }), seat([2.2, 0.99], -90, 'sit', { y: 0.24 })],
  lighting: { mood: 'bar', practicals: [[2.0, 3.0, 2.4]], practicalColor: '#ffb27a' },
};

