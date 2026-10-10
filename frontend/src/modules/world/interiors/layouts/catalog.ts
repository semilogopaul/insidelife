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
import {
  JET_CABIN,
  JET_COCKPIT,
  JET_LAVATORY,
  MANSION_CINEMA as SHOWCASE_CINEMA,
  MANSION_CLOSET,
  MANSION_GALLERY,
  MANSION_GAMES,
  MANSION_GUEST,
  MANSION_KITCHEN as SHOWCASE_KITCHEN,
  MANSION_MASTER as SHOWCASE_MASTER,
  MANSION_PARLOUR,
  MANSION_STUDIO,
  REFINERY_CENTRE,
  REFINERY_GALLERY,
} from '../templates/catalog/showcase';
import { getTemplate } from '../templates/registry';
import type { InteriorTemplateId } from '../templates/resolve';
import type { InteriorTemplate } from '../templates/types';
import type { HomeLayout, LayoutRoom } from './types';

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

/** The walkable layout of a home template (null for venues). */
export function homeLayoutFor(templateId: string): HomeLayout | null {
  return (HOME_LAYOUTS as Readonly<Record<string, HomeLayout>>)[templateId] ?? null;
}

/** A room that leads back to `to` through its first door. */
const sideRoom = (id: string, label: string, level: number, template: InteriorTemplate, to: string, actions: readonly string[]): LayoutRoom => ({
  id,
  label,
  level,
  template,
  portals: [{ id: to, via: { door: 0 }, to: { room: to, portal: id } }],
  actions,
});

/**
 * OBO Mansion: the grand parlour (front door, grand stairs) opens onto the kitchen, the games room and the cinema;
 * upstairs, the gallery landing leads to the studio, the master suite and two guest suites. Each room lists the place
 * actions that happen in it (several share the `sit` animation: the cinema, the gaming couch, the studio couch).
 */
export const OBO_MANSION_LAYOUT: HomeLayout = {
  id: 'mansion',
  entry: 'parlour',
  rooms: [
    {
      id: 'parlour',
      label: 'Grand parlour',
      level: 0,
      template: MANSION_PARLOUR,
      portals: [
        { id: 'front', via: { door: 0 }, to: null },
        { id: 'kitchen', via: { door: 1 }, to: { room: 'kitchen', portal: 'parlour' } },
        { id: 'games', via: { door: 2 }, to: { room: 'games', portal: 'parlour' } },
        { id: 'cinema', via: { door: 3 }, to: { room: 'cinema', portal: 'parlour' } },
        { id: 'up', via: { stairs: 0 }, to: { room: 'gallery', portal: 'down' } },
      ],
      actions: ['obo-hangout', 'obo-big-screen', 'obo-art-selfie'],
    },
    sideRoom('kitchen', 'Chef’s kitchen', 0, SHOWCASE_KITCHEN, 'parlour', ['obo-chef-table']),
    sideRoom('games', 'Games room', 0, MANSION_GAMES, 'parlour', ['obo-fifa', 'obo-snooker', 'obo-arcade']),
    sideRoom('cinema', 'Cinema', 0, SHOWCASE_CINEMA, 'parlour', ['obo-movie', 'obo-vip-screening']),
    {
      id: 'gallery',
      label: 'Art gallery',
      level: 1,
      template: MANSION_GALLERY,
      portals: [
        { id: 'down', via: { stairwell: 0 }, to: { room: 'parlour', portal: 'up' } },
        { id: 'studio', via: { door: 0 }, to: { room: 'studio', portal: 'gallery' } },
        { id: 'master', via: { door: 1 }, to: { room: 'master', portal: 'gallery' } },
        { id: 'guest', via: { door: 2 }, to: { room: 'guest', portal: 'gallery' } },
        { id: 'closet', via: { door: 3 }, to: { room: 'closet', portal: 'gallery' } },
      ],
      actions: ['obo-gallery'],
    },
    sideRoom('studio', 'Music studio', 1, MANSION_STUDIO, 'gallery', ['obo-listen', 'obo-record']),
    sideRoom('master', 'Master suite', 1, SHOWCASE_MASTER, 'gallery', ['obo-suite-rest']),
    sideRoom('guest', 'Guest suite', 1, MANSION_GUEST, 'gallery', ['obo-freshen-up']),
    sideRoom('closet', 'Guest suite & closet', 1, MANSION_CLOSET, 'gallery', ['obo-drip']),
  ],
  activityRooms: {},
};

/** AIR OBO: the cabin (airstair door) with the cockpit forward and the lavatory aft. It never takes off. */
export const AIR_OBO_LAYOUT: HomeLayout = {
  id: 'private-jet',
  entry: 'cabin',
  rooms: [
    {
      id: 'cabin',
      label: 'Cabin',
      level: 0,
      template: JET_CABIN,
      portals: [
        { id: 'airstair', via: { door: 0 }, to: null },
        { id: 'cockpit', via: { door: 1 }, to: { room: 'cockpit', portal: 'cabin' } },
        { id: 'lavatory', via: { door: 2 }, to: { room: 'lavatory', portal: 'cabin' } },
      ],
      actions: ['air-obo-cabin', 'air-obo-champagne'],
    },
    sideRoom('cockpit', 'Cockpit', 0, JET_COCKPIT, 'cabin', ['air-obo-captain', 'air-obo-selfie']),
    sideRoom('lavatory', 'Lavatory', 0, JET_LAVATORY, 'cabin', ['air-obo-toilet']),
  ],
  activityRooms: {},
};

/** Dangote Refinery: the visitor centre (exhibition, gift shop) and the viewing gallery where tours start. */
export const DANGOTE_REFINERY_LAYOUT: HomeLayout = {
  id: 'refinery',
  entry: 'centre',
  rooms: [
    {
      id: 'centre',
      label: 'Visitor centre',
      level: 0,
      template: REFINERY_CENTRE,
      portals: [
        { id: 'front', via: { door: 0 }, to: null },
        { id: 'gallery', via: { door: 1 }, to: { room: 'gallery', portal: 'centre' } },
      ],
      actions: ['refinery-learn', 'refinery-gift-shop'],
    },
    sideRoom('gallery', 'Viewing gallery', 0, REFINERY_GALLERY, 'centre', ['refinery-tour', 'refinery-view']),
  ],
  activityRooms: {},
};

/** Venues with several rooms, by template id (every other venue is one room). */
export const VENUE_ROOM_LAYOUTS: Readonly<Partial<Record<InteriorTemplateId, HomeLayout>>> = {
  mansion: OBO_MANSION_LAYOUT,
  'private-jet': AIR_OBO_LAYOUT,
  refinery: DANGOTE_REFINERY_LAYOUT,
};

const VENUE_LAYOUTS = new Map<string, HomeLayout>();

/**
 * The walkable layout of any place: a home's rooms, a multi-room venue's rooms, or a venue's one room (its first door
 * is the way out; open-air venues have none and you arrive at their default spot). Stable per template, so it can key
 * effects.
 */
export function placeLayoutFor(templateId: InteriorTemplateId): HomeLayout {
  const home = homeLayoutFor(templateId);
  if (home) return home;
  const rooms = VENUE_ROOM_LAYOUTS[templateId];
  if (rooms) return rooms;
  let layout = VENUE_LAYOUTS.get(templateId);
  if (!layout) {
    layout = singleRoom(getTemplate(templateId));
    VENUE_LAYOUTS.set(templateId, layout);
  }
  return layout;
}
