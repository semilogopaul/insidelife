import type { HomeLayout } from '../../interiors/layouts/types';
import { AVIATION_AIRSIDE, AVIATION_LOUNGE, AVIATION_TERMINAL_ID } from './terminal-templates';

/**
 * The General Aviation Terminal as a walkable place: the lounge (entry: the street door, the airside door at the back)
 * and the airside apron. Both Lagos and Abuja GATs use it. Place actions per room (`LayoutRoom.actions`) are filled in
 * when the catalog gains the terminal's actions (sales desk, flight school): the rooms are `lounge` and `airside`.
 */
export const AVIATION_TERMINAL_LAYOUT: HomeLayout = {
  id: AVIATION_TERMINAL_ID,
  entry: 'lounge',
  rooms: [
    {
      id: 'lounge',
      label: 'Lounge',
      level: 0,
      template: AVIATION_LOUNGE,
      portals: [
        { id: 'front', via: { door: 0 }, to: null },
        { id: 'airside', via: { door: 1 }, to: { room: 'airside', portal: 'lounge' } },
      ],
      actions: [],
    },
    {
      id: 'airside',
      label: 'Airside',
      level: 0,
      template: AVIATION_AIRSIDE,
      portals: [{ id: 'lounge', via: { door: 0 }, to: { room: 'lounge', portal: 'airside' } }],
      actions: [],
    },
  ],
  activityRooms: {},
};
