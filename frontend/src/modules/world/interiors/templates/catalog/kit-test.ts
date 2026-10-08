import type { InteriorTemplate } from '../types';

/** Dev-only: every orientation-sensitive kit model in a row at rot 0 (front should face +Z / the camera). */
export const KIT_TEST: InteriorTemplate = {
  id: 'kit-test',
  label: 'Kit test',
  room: { width: 12, depth: 6, height: 2.4, floor: 'tiles', floorColor: '#d9d2c3', wall: { style: 'paint', color: '#e8dcc4' } },
  furniture: [
    { model: 'chair', at: [-5, -1.5] },
    { model: 'chairCushion', at: [-4, -1.5] },
    { model: 'chairDesk', at: [-3, -1.5] },
    { model: 'loungeSofa', at: [-1.5, -1.5] },
    { model: 'loungeChair', at: [0.3, -1.5] },
    { model: 'bedSingle', at: [1.8, -1.5] },
    { model: 'bedDouble', at: [3.6, -1.5] },
    { model: 'desk', at: [-5, 1] },
    { model: 'televisionModern', at: [-3.4, 1] },
    { model: 'computerScreen', at: [-2.2, 1] },
    { model: 'kitchenStove', at: [-1, 1] },
    { model: 'kitchenFridge', at: [0, 1] },
    { model: 'toilet', at: [1, 1] },
    { model: 'bookcaseOpen', at: [2, 1] },
    { model: 'bench', at: [3.2, 1] },
    { model: 'cabinetTelevision', at: [4.6, 1] },
  ],
  props: [],
  player: { default: { at: [5.3, 1.5], animation: 'idle' } },
  npcs: [],
  guests: [],
  lighting: { mood: 'home' },
};
