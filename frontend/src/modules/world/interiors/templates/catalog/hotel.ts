import type { PropSpec } from '../../props/prop-types';
import { BAR_STOOL_LIFT, bed, gridPoints, npc, place, row, seat, stand } from '../helpers';
import type { FurniturePlacement, InteriorTemplate } from '../types';

const GLASS_WALL = '#cfd8dc';

/** A half-height glass partition (the camera looks over it into the guest room). */
const partition = (at: readonly [number, number], size: readonly [number, number, number]): PropSpec => ({ kind: 'box', at, size, color: GLASS_WALL, surface: 'gloss', round: 0.02 });

/**
 * A hotel: a lobby with a reception desk, a restaurant and bar along the back wall, a pool in the front corner, a
 * small gym, and a guest room behind a glass partition (bed, bedside lamps, a TV). One room; the hotel's name is on
 * its board, and `LOOKS` dress it as each real hotel (and take out the gym where a hotel has none).
 */
export const HOTEL: InteriorTemplate = {
  id: 'hotel',
  label: 'Hotel',
  room: {
    width: 14,
    depth: 10,
    height: 3.4,
    floor: 'marble',
    floorColor: '#e9e2d6',
    wall: { style: 'paint', color: '#f2e9d8', band: '#8d6e3a' },
    windows: [
      { wall: 'back', at: -1.2, width: 1.8, sill: 0.9, height: 2.2, bars: false },
      { wall: 'back', at: 1.9, width: 1.8, sill: 0.9, height: 2.2, bars: false },
    ],
    doors: [{ wall: 'left', at: -0.6, width: 1.6 }],
    curtain: '#c9a227',
  },
  furniture: [
    // Lobby lounge.
    place('loungeSofa', [-4.6, 1.5], 90, { palette: { carpet: '#f1ebe0', carpetDarker: '#d8cdb8' } }),
    place('loungeSofa', [-2.2, 2.9], 180, { palette: { carpet: '#f1ebe0', carpetDarker: '#d8cdb8' } }),
    place('tableCoffeeGlass', [-3.2, 1.6], 0),
    place('pottedPlant', [-6.4, -4.2], 0, { scale: 1.5 }),
    place('pottedPlant', [-6.4, 4.2], 0, { scale: 1.5 }),
    place('pottedPlant', [3.0, 4.2], 0, { scale: 1.4 }),
    // A lounge chair beside the pool.
    place('loungeChairRelax', [-1.7, 3.6], 90),
    place('computerScreen', [-4.2, -3.55], 0, { y: 0.93 }),
    // Bar stools and restaurant chairs.
    ...row('stoolBar', 3, [0.2, -3.35], [0.75, 0], 180),
    ...gridPoints(2, 1, [2.0, 1.2], [2.2, 0]).flatMap(([x, z]): FurniturePlacement[] => [
      place('chairCushion', [x, z - 0.8], 0, { palette: { carpet: '#7b2d3b', wood: '#3e2723' } }),
      place('chairCushion', [x - 0.75, z - 0.2], 90, { palette: { carpet: '#7b2d3b', wood: '#3e2723' } }),
    ]),
    // Guest room (behind the glass).
    place('bedDouble', [5.5, -3.55], 0, { palette: { carpet: '#f5efe6', carpetDarker: '#d9cdb8', wood: '#4e342e' } }),
    place('cabinetBedDrawer', [4.2, -4.4], 0),
    place('cabinetBedDrawer', [6.8, -4.4], 0),
    place('lampRoundTable', [4.2, -4.4], 0, { y: 0.39 }),
    place('lampRoundTable', [6.8, -4.4], 0, { y: 0.39 }),
    place('cabinetTelevision', [6.75, -2.3], -90),
    place('televisionModern', [6.78, -2.3], -90, { y: 0.47 }),
  ],
  props: [
    // Reception.
    { kind: 'bar-counter', at: [-4.2, -3.4], length: 4.0, color: '#3e2723', top: '#f5efe6', thing: { kind: 'counter', name: 'Reception' } },
    { kind: 'sign', at: [-4.2, -4.98], y: 2.3, wall: true, size: [3.6, 0.5], lines: ['RECEPTION • CHECKOUT AT 12 NOON'], bg: '#3e2723', fg: '#f3d27a' },
    { kind: 'sign', at: [-6.98, -3.0], rot: 90, y: 2.7, wall: true, size: [3.6, 0.55], lines: ['HOTEL'], bg: '#3e2723', fg: '#f3d27a', venueName: true },
    // Bar and restaurant.
    { kind: 'bar-counter', at: [1.2, -4.2], length: 3.4, color: '#4e342e', top: '#d7ccc8', thing: { kind: 'bar', name: 'Hotel bar' } },
    { kind: 'bottles', at: [0.4, -4.2], y: 0.92, count: 3 },
    { kind: 'bottles', at: [1.9, -4.2], y: 0.92, count: 2 },
    { kind: 'chandelier', at: [-3.4, 1.0], height: 3.0 },
    { kind: 'chandelier', at: [2.0, 1.2], height: 3.0 },
    ...gridPoints(2, 1, [2.0, 1.2], [2.2, 0]).flatMap(([x, z]): PropSpec[] => [
      { kind: 'table-cloth', at: [x, z], size: [1.2, 0.5, 0.9], color: '#fafafa' },
      { kind: 'food-plate', at: [x - 0.25, z], y: 0.5, food: 'jollof' },
      { kind: 'bottles', at: [x + 0.25, z + 0.1], y: 0.5, count: 1 },
    ]),
    // Pool: a deck, the water, and a lounger.
    { kind: 'box', at: [-4.8, 3.8], size: [3.3, 0.1, 2.0], color: '#e0f2f1', surface: 'stone' },
    { kind: 'box', at: [-4.8, 3.8], size: [2.9, 0.16, 1.6], color: '#29b6f6', surface: 'gloss' },
    // Gym corner.
    { kind: 'treadmill', at: [5.4, 1.2], rot: 180 },
    { kind: 'treadmill', at: [6.3, 1.2], rot: 180 },
    { kind: 'bench-press', at: [4.5, 4.0], rot: 90 },
    { kind: 'dumbbell-rack', at: [6.7, 4.3], rot: 90 },
    // The guest room's glass.
    partition([4.0, -1.4], [1.2, 1.0, 0.1]),
    partition([6.3, -1.4], [1.4, 1.0, 0.1]),
    partition([3.4, -3.2], [0.1, 1.0, 3.6]),
  ],
  player: {
    default: stand([-4.2, -2.1], 180),
    sleep: bed([5.5, -3.55]),
    sit: seat([-1.7, 3.6], 90, 'sit'),
    phone: seat([-4.6, 1.5], 90, 'phone'),
    talk: stand([-3.4, 0.2], 30, 'talk'),
    eat: seat([2.0, 0.4], 0, 'eat'),
    drink: seat([0.95, -3.35], 180, 'drink', { y: BAR_STOOL_LIFT }),
    exercise: stand([5.6, 3.0], 20, 'exercise'),
  },
  npcs: [
    npc(stand([-4.2, -4.2], 0, 'talk'), 'uniform', { gender: 'female' }),
    npc(stand([1.2, -4.8], 0, 'talk'), 'uniform', { gender: 'male', lod: 'low' }),
    npc(seat([-4.6, 1.0], 90, 'sit'), 'corporate', { gender: 'male' }),
    npc(seat([0.95 + 0.75, -3.35], 180, 'drink', { y: BAR_STOOL_LIFT }), 'club', { gender: 'female' }),
    npc(seat([3.5, 0.4], 0, 'eat'), 'corporate', { lod: 'low' }),
    npc(stand([4.2, 2.5], 200, 'exercise'), 'gym', { lod: 'low' }),
  ],
  guests: [seat([-2.2, 2.85], 180, 'talk'), stand([-2.4, 0.5], 200, 'talk'), seat([0.2, -3.35], 180, 'drink', { y: BAR_STOOL_LIFT })],
  lighting: { mood: 'hall', practicals: [[-3.4, 3.2, 1.0], [2.0, 3.2, 1.2], [5.5, 2.9, -3.0]], practicalColor: '#ffd9a0' },
};
