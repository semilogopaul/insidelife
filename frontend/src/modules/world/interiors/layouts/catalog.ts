import {
  DUPLEX_BEDROOM,
  DUPLEX_KITCHEN,
  FLAT_BEDROOM,
  FLAT_KITCHEN,
  MANSION_CINEMA,
  MANSION_KITCHEN,
  MANSION_MASTER,
} from '../templates/catalog/home-rooms';
import {
  HOME_DUPLEX,
  HOME_FACE_ME,
  HOME_FAMILY,
  HOME_FLAT,
  HOME_HOSTEL,
  HOME_MANSION,
  HOME_SELF_CONTAIN,
} from '../templates/catalog/homes';
import type { InteriorTemplateId } from '../templates/resolve';
import type { InteriorTemplate } from '../templates/types';
import type { HomeLayout } from './types';

/**
 * Every home is a layout. Small homes are one walkable room; flats, duplexes and mansions are several rooms joined by
 * doors (and stairs between floors). Portal links are symmetric (checked by tests).
 */

/** A one-room home: its first door is the front door. */
function singleRoom(template: InteriorTemplate): HomeLayout {
  return {
    id: template.id,
    entry: 'room',
    rooms: [
      {
        id: 'room',
        label: template.label,
        level: 0,
        template,
        portals: template.room.doors?.length ? [{ id: 'front', via: { door: 0 }, to: null }] : [],
      },
    ],
    activityRooms: {},
  };
}

/** Living room (front door) → kitchen and bedroom. */
export const FLAT_LAYOUT: HomeLayout = {
  id: 'home-flat',
  entry: 'living',
  rooms: [
    {
      id: 'living',
      label: 'Living room',
      level: 0,
      template: HOME_FLAT,
      portals: [
        { id: 'front', via: { door: 0 }, to: null },
        { id: 'bedroom', via: { door: 1 }, to: { room: 'bedroom', portal: 'living' } },
        { id: 'kitchen', via: { door: 2 }, to: { room: 'kitchen', portal: 'living' } },
      ],
    },
    {
      id: 'kitchen',
      label: 'Kitchen',
      level: 0,
      template: FLAT_KITCHEN,
      portals: [{ id: 'living', via: { door: 0 }, to: { room: 'living', portal: 'kitchen' } }],
    },
    {
      id: 'bedroom',
      label: 'Bedroom',
      level: 0,
      template: FLAT_BEDROOM,
      portals: [{ id: 'living', via: { door: 0 }, to: { room: 'living', portal: 'bedroom' } }],
    },
  ],
  activityRooms: {
    sleep: 'bedroom',
    shower: 'bedroom',
    type: 'bedroom',
    read: 'bedroom',
    cook: 'kitchen',
    sit: 'living',
    eat: 'living',
    talk: 'living',
    exercise: 'living',
    dance: 'living',
  },
};

/** Living room (front door, stairs up) → kitchen; upstairs, the master bedroom. */
export const DUPLEX_LAYOUT: HomeLayout = {
  id: 'home-duplex',
  entry: 'living',
  rooms: [
    {
      id: 'living',
      label: 'Living room',
      level: 0,
      template: HOME_DUPLEX,
      portals: [
        { id: 'front', via: { door: 0 }, to: null },
        { id: 'kitchen', via: { door: 1 }, to: { room: 'kitchen', portal: 'living' } },
        { id: 'up', via: { stairs: 0 }, to: { room: 'bedroom', portal: 'down' } },
      ],
    },
    {
      id: 'kitchen',
      label: 'Kitchen',
      level: 0,
      template: DUPLEX_KITCHEN,
      portals: [{ id: 'living', via: { door: 0 }, to: { room: 'living', portal: 'kitchen' } }],
    },
    {
      id: 'bedroom',
      label: 'Master bedroom',
      level: 1,
      template: DUPLEX_BEDROOM,
      portals: [{ id: 'down', via: { stairwell: 0 }, to: { room: 'living', portal: 'up' } }],
    },
  ],
  activityRooms: {
    sleep: 'bedroom',
    shower: 'bedroom',
    type: 'bedroom',
    read: 'bedroom',
    cook: 'kitchen',
    sit: 'living',
    eat: 'living',
    talk: 'living',
    exercise: 'living',
    dance: 'living',
  },
};

/** Living room (front door, grand stairs) → kitchen; upstairs, the cinema lounge → master suite. */
export const MANSION_LAYOUT: HomeLayout = {
  id: 'home-mansion',
  entry: 'living',
  rooms: [
    {
      id: 'living',
      label: 'Living room',
      level: 0,
      template: HOME_MANSION,
      portals: [
        { id: 'front', via: { door: 0 }, to: null },
        { id: 'kitchen', via: { door: 1 }, to: { room: 'kitchen', portal: 'living' } },
        { id: 'up', via: { stairs: 0 }, to: { room: 'cinema', portal: 'down' } },
      ],
    },
    {
      id: 'kitchen',
      label: 'Kitchen',
      level: 0,
      template: MANSION_KITCHEN,
      portals: [{ id: 'living', via: { door: 0 }, to: { room: 'living', portal: 'kitchen' } }],
    },
    {
      id: 'cinema',
      label: 'Cinema lounge',
      level: 1,
      template: MANSION_CINEMA,
      portals: [
        { id: 'down', via: { stairwell: 0 }, to: { room: 'living', portal: 'up' } },
        { id: 'master', via: { door: 0 }, to: { room: 'master', portal: 'cinema' } },
      ],
    },
    {
      id: 'master',
      label: 'Master suite',
      level: 1,
      template: MANSION_MASTER,
      portals: [{ id: 'cinema', via: { door: 0 }, to: { room: 'cinema', portal: 'master' } }],
    },
  ],
  activityRooms: {
    sleep: 'master',
    shower: 'master',
    type: 'master',
    read: 'master',
    cook: 'kitchen',
    sit: 'living',
    eat: 'living',
    talk: 'living',
    exercise: 'living',
    dance: 'living',
  },
};

export const HOME_LAYOUTS: Readonly<Record<Extract<InteriorTemplateId, `home-${string}`>, HomeLayout>> = {
  'home-family': singleRoom(HOME_FAMILY),
  'home-face-me': singleRoom(HOME_FACE_ME),
  'home-self-contain': singleRoom(HOME_SELF_CONTAIN),
  'home-hostel': singleRoom(HOME_HOSTEL),
  'home-flat': FLAT_LAYOUT,
  'home-duplex': DUPLEX_LAYOUT,
  'home-mansion': MANSION_LAYOUT,
};

/** The walkable layout of a home template (null for venues, which keep the dollhouse). */
export function homeLayoutFor(templateId: string): HomeLayout | null {
  return (HOME_LAYOUTS as Readonly<Record<string, HomeLayout>>)[templateId] ?? null;
}
