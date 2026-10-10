import { VENUES, VENUE_TYPES, findAction, type ActionDefinition } from '@insidelife/shared';
import { PerspectiveCamera, Vector3 } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MORE_HERE_ID,
  actionsAt,
  isPlaceAction,
  serviceInteractableId,
  serviceOfInteractable,
  servicesAt,
  PLACE_SERVICES,
} from '@/common/places';
import { AVATAR_CLIPS } from '@/common/three/avatar';
import { controls, resetControls } from '../../play/input/controls';
import {
  actionAnchor,
  actionSpot,
  barStoolSpot,
  counterSpot,
  occupiedFeet,
  pieceTop,
} from '../hotspots/action-spots';
import {
  MAX_MORE,
  actionOfInteractable,
  buildHotspots,
  holdsGoal,
  hotspotAt,
  hotspotCard,
  hotspotInteractable,
  hotspotRoom,
  type Hotspot,
} from '../hotspots/hotspots';
import { closestOnBox, rayHitsBox, roomObjects } from '../hotspots/objects';
import { HOME_LAYOUTS, placeLayoutFor } from '../layouts/catalog';
import { findRoom, portalGeometry } from '../layouts/geometry';
import { getTemplate } from '../templates/registry';
import {
  INTERIOR_TEMPLATE_IDS,
  genericTemplateFor,
  resolveTemplateId,
  venueTypeFor,
  type InteriorTemplateId,
} from '../templates/resolve';
import type { At, InteriorTemplate, Spot } from '../templates/types';
import { HomeWalkRuntime, buildRoomPhysics } from '../walk/home-walk-runtime';
import { approachPoint } from '../walk/nav-grid';

const action = (id: string): ActionDefinition => {
  const found = findAction(id);
  if (!found) throw new Error(id);
  return found;
};
const foot = (spot: Spot): At => [spot.at[0], spot.at[spot.at.length - 1] as number];
const near = (a: At, b: At, distance = 0.05): boolean => Math.hypot(a[0] - b[0], a[1] - b[1]) < distance;
const VENUE_TEMPLATES = INTERIOR_TEMPLATE_IDS.filter((id) => !id.startsWith('home-'));

/** A treatment the hospital might offer, described only by animation and category (no template knows its id). */
const treatment = (
  animation: 'sit' | 'sleep' | 'talk',
): Pick<ActionDefinition, 'animation' | 'category'> => ({
  animation,
  category: 'health' as ActionDefinition['category'],
});

describe('where actions happen', () => {
  it('drinks at the lounge on a free bar stool, at stool height, nowhere anyone else is', () => {
    const bar = getTemplate('bar');
    const spot = actionSpot(bar, action('lounge'));
    expect(spot.stance).toBe('sit');
    expect(spot.at.length).toBe(3);
    expect(spot.at[1]).toBeGreaterThan(0.2);
    const stool = bar.furniture.find(
      (piece) => piece.model === 'stoolBar' && near(piece.at, foot(spot), 0.12),
    );
    expect(stool).toBeDefined();
    expect(spot.at[1]).toBeCloseTo(pieceTop(stool!) - 0.36, 1);
    for (const person of occupiedFeet(bar)) expect(near(person, foot(spot), 0.35)).toBe(false);
  });

  it('derives a stool for a drink from any room with bar stools, and stands at the counter without them', () => {
    const club = getTemplate('club');
    const stool = barStoolSpot(club);
    expect(
      stool &&
        club.furniture.some((piece) => piece.model === 'stoolBar' && near(piece.at, foot(stool), 0.12)),
    ).toBe(true);
    const pharmacy = getTemplate('pharmacy');
    const counter = counterSpot(pharmacy, ['bar-counter']);
    // The pharmacy counter runs along x at z = −0.4 and faces +z: customers stand in front, facing it (rot 180).
    expect(counter?.at[1]).toBeGreaterThan(-0.1);
    expect(counter?.rot).toBe(180);
    const noStools = {
      ...getTemplate('bar'),
      furniture: getTemplate('bar').furniture.filter((piece) => piece.model !== 'stoolBar'),
      player: { default: getTemplate('bar').player.default },
    };
    const standing = actionSpot(noStools, action('lounge'));
    expect(standing.stance).toBeUndefined();
    expect(standing.at[1]).toBeGreaterThan(-2.35);
  });

  it('dances and cheers on the club’s dance floor', () => {
    const club = getTemplate('club');
    const floor = club.extras?.clubLights;
    for (const animation of ['dance', 'cheer'] as const) {
      const [x, z] = foot(actionSpot(club, { animation, category: 'social' }));
      expect(Math.abs(x - (floor?.at[0] ?? 99)), animation).toBeLessThan((floor?.size[0] ?? 0) / 2);
      expect(Math.abs(z - (floor?.at[1] ?? 99)), animation).toBeLessThan((floor?.size[1] ?? 0) / 2);
    }
  });

  it('eats at a table, studies at a desk, works out on the gym floor, prays on the mat', () => {
    expect(actionSpot(getTemplate('restaurant'), action('fine-dining'))).toBe(
      getTemplate('restaurant').player.eat,
    );
    expect(actionSpot(getTemplate('campus'), action('study'))).toBe(getTemplate('campus').player.read);
    expect(actionSpot(getTemplate('gym'), action('gym'))).toBe(getTemplate('gym').player.exercise);
    expect(actionSpot(getTemplate('mosque'), action('worship')).stance).toBe('kneel');
  });

  it('treats patients by animation: a seat by the doctor, a bed, the nurses', () => {
    const clinic = getTemplate('clinic');
    expect(actionSpot(clinic, treatment('sit'))).toBe(clinic.player.sit);
    expect(actionSpot(clinic, treatment('sleep'))).toBe(clinic.player.sleep);
    expect(foot(actionSpot(clinic, treatment('talk')))).toEqual(foot(clinic.player.talk!));
    const ward = getTemplate('hospital-ward');
    expect(actionSpot(ward, treatment('sleep'))).toBe(ward.player.sleep);
  });

  it('window-shops at the shelves, standing and facing them', () => {
    const mall = getTemplate('mall');
    const spot = actionSpot(mall, action('window-shop'));
    expect(spot.stance).toBeUndefined();
    const shelf = mall.props.find((prop) => prop.kind === 'shelf');
    expect(
      Math.hypot(spot.at[0] - (shelf?.at[0] ?? 99), (spot.at[1] as number) - (shelf?.at[1] ?? 99)),
    ).toBeLessThan(1.6);
  });

  it('never dances on a sofa, and falls back to the default spot for anything unknown', () => {
    const lounge = {
      ...getTemplate('bar'),
      player: { default: getTemplate('bar').player.default, sit: getTemplate('bar').player.sit },
    };
    const dance = actionSpot(lounge, { animation: 'dance', category: 'fun' });
    expect(dance.stance).not.toBe('sit');
    const odd = actionSpot(getTemplate('bar'), { animation: 'wave', category: 'mystery' });
    expect(odd.animation).toBe('wave');
    for (const id of VENUE_TEMPLATES) {
      const template = getTemplate(id);
      for (const clip of Object.keys(AVATAR_CLIPS) as Array<keyof typeof AVATAR_CLIPS>) {
        const spot = actionSpot(template, { animation: clip });
        if (AVATAR_CLIPS[clip].kind === 'full') expect(spot.stance, `${id} ${clip}`).not.toBe('sit');
      }
    }
  });
});

describe('hotspots', () => {
  it('puts Watch and Play at the TV and Sleep with Nap on the bed, in the right rooms of a flat', () => {
    const flat = HOME_LAYOUTS['home-flat'];
    const homeActions = actionsAt({ kind: 'home' }).filter(isPlaceAction);
    const roomOf = (id: string): string => hotspotRoom(flat, action(id));
    expect(roomOf('sleep')).toBe('bedroom');
    expect(roomOf('cook')).toBe('kitchen');
    expect(roomOf('watch-tv')).toBe('living');
    const living = findRoom(flat, 'living')!.template;
    const hotspots = buildHotspots(
      living,
      homeActions.filter((candidate) => roomOf(candidate.id) === 'living'),
    );
    const tv = living.furniture.find((piece) => piece.slot === 'tv')!;
    const watch = hotspots.find((hotspot) =>
      hotspot.actions.some((candidate) => candidate.id === 'watch-tv'),
    );
    expect(watch && near(watch.at, tv.at)).toBe(true);
    expect(watch?.actions.map((candidate) => candidate.id)).toEqual(
      expect.arrayContaining(['watch-tv', 'play-games']),
    );
    // ...but you still watch from the sofa.
    expect(actionSpot(living, action('watch-tv'))).toBe(living.player.sit);
    const bedroom = findRoom(flat, 'bedroom')!.template;
    const bed = buildHotspots(
      bedroom,
      homeActions.filter((candidate) => roomOf(candidate.id) === 'bedroom'),
    ).find((hotspot) => hotspot.actions[0]?.id === 'sleep');
    expect(bed?.actions.map((candidate) => candidate.id)).toEqual(['sleep', 'nap']);
  });

  it('anchors at the spot when the furniture an action needs isn’t there (you don’t own a TV)', () => {
    const living = findRoom(HOME_LAYOUTS['home-flat'], 'living')!.template;
    const bare = { ...living, furniture: living.furniture.filter((piece) => piece.slot !== 'tv') };
    expect(near(actionAnchor(bare, action('watch-tv'), living).at, foot(living.player.sit!))).toBe(true);
  });

  const lounge = buildHotspots(
    getTemplate('bar'),
    actionsAt({ kind: 'venue', venueType: 'bar' }).filter(isPlaceAction),
  );

  it('offers the hotspot you’re standing at, keeps it a little past its edge, nothing in between', () => {
    const drinks = lounge.find((hotspot) => hotspot.id === 'hotspot:lounge') as Hotspot;
    expect(drinks).toBeDefined();
    expect(hotspotAt(lounge, drinks.at[0], drinks.at[1] + 0.6)?.id).toBe(drinks.id);
    // Reach is measured from the bar itself (all 5 m of it), not its middle.
    const edge = drinks.box.maxX + drinks.reach + 0.15;
    expect(hotspotAt(lounge, edge, drinks.at[1])).toBeNull();
    expect(hotspotAt(lounge, edge, drinks.at[1], drinks.id)?.id).toBe(drinks.id);
    expect(hotspotAt(lounge, drinks.box.minX + 0.3, drinks.box.maxZ + 0.5)?.id).toBe(drinks.id);
    expect(hotspotAt(lounge, 4.5, 3.2)).toBeNull();
    // Between two hotspots, the one you're deeper inside wins.
    const square = (x: number) => ({ minX: x - 0.4, maxX: x + 0.4, minZ: -0.4, maxZ: 0.4, minY: 0, maxY: 1 });
    const two: Hotspot[] = [
      {
        id: 'a',
        kind: 'spot',
        name: 'A',
        at: [0, 0],
        y: 1,
        box: square(0),
        reach: 1,
        actions: [],
        services: [],
        aliases: [],
      },
      {
        id: 'b',
        kind: 'spot',
        name: 'B',
        at: [2.4, 0],
        y: 1,
        box: square(2.4),
        reach: 1,
        actions: [],
        services: [],
        aliases: [],
      },
    ];
    expect(hotspotAt(two, 1.1, 0)?.id).toBe('a');
    expect(hotspotAt(two, 1.3, 0)?.id).toBe('b');
  });

  it('offers “Drinks at the lounge · ₦18,000” on the context button, the rest as smaller buttons', () => {
    const drinks = lounge.find((hotspot) => hotspot.id === 'hotspot:lounge') as Hotspot;
    const offer = hotspotInteractable(drinks, (candidate) => ({
      priceNote: candidate.cost > 0 ? '₦18,000' : '',
      reason: null,
    }));
    expect(offer).toMatchObject({ kind: 'activity', label: 'Drinks at the lounge · ₦18,000', emoji: '🍹' });
    expect(offer?.disabled).toBeUndefined();
    expect(actionOfInteractable(offer!.id)).toBe('lounge');
    expect(actionOfInteractable('world:step-outside')).toBeNull();
    const crowded: Hotspot = {
      id: 'x',
      kind: 'spot',
      name: 'Here',
      at: [0, 0],
      y: 1,
      box: { minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4, minY: 0, maxY: 1 },
      reach: 1,
      actions: actionsAt({ kind: 'home' }).slice(0, 7),
      services: [],
      aliases: [],
    };
    const many = hotspotInteractable(crowded, () => ({ priceNote: '', reason: null }));
    // Three more, then "More here" for the rest (the full list).
    expect(many?.more).toHaveLength(MAX_MORE + 1);
    expect(many?.more?.at(-1)).toMatchObject({ id: MORE_HERE_ID, label: 'More here (3)' });
  });

  it('puts phone-app services where they happen: a car on the showroom floor, the doctor’s desk', () => {
    const showroom = getTemplate('car-dealer');
    const [cars] = buildHotspots(
      showroom,
      [],
      showroom,
      servicesAt({ kind: 'venue', venueType: 'car-dealer' }),
    );
    expect(cars).toMatchObject({ kind: 'car', name: 'Car on show' });
    expect(cars && near(cars.at, showroom.extras?.cars?.[0]?.at ?? [99, 99])).toBe(true);
    const offer = cars ? hotspotInteractable(cars, () => ({ priceNote: '', reason: null })) : null;
    expect(offer).toMatchObject({
      id: serviceInteractableId('browse-cars'),
      label: 'Browse cars',
      emoji: '🚗',
    });
    expect(serviceOfInteractable(offer?.id ?? '')).toMatchObject({
      opens: { app: 'motors', param: 'dealer' },
    });
    const clinic = getTemplate('clinic');
    const [desk] = buildHotspots(
      clinic,
      [],
      clinic,
      servicesAt({ kind: 'venue', venueType: 'hospital-private' }),
    );
    // The desk the doctor sits at (staffed), not just any table.
    expect(desk).toMatchObject({ kind: 'desk', name: 'Doctor’s desk' });
    const ward = getTemplate('hospital-ward');
    const [station] = buildHotspots(
      ward,
      [],
      ward,
      servicesAt({ kind: 'venue', venueType: 'hospital-public' }),
    );
    expect(station).toMatchObject({ kind: 'desk', name: 'Nurses’ station' });
    expect(servicesAt({ kind: 'home' })).toEqual([]);
  });

  it('greys out what can’t be done now, with the reason', () => {
    const drinks = lounge.find((hotspot) => hotspot.id === 'hotspot:lounge') as Hotspot;
    const offer = hotspotInteractable(drinks, () => ({
      priceNote: '₦18,000',
      reason: 'Not enough money (₦18,000)',
    }));
    expect(offer?.disabled).toBe('Not enough money (₦18,000)');
  });
});

/** Where you appear coming in (the front door; open-air venues: their default spot), on the walkable grid. */
function entrance(template: InteriorTemplate, physics: ReturnType<typeof buildRoomPhysics>): At {
  const door = template.room.doors?.length
    ? portalGeometry(template, { id: 'front', via: { door: 0 }, to: null }).arrival
    : null;
  const start = door ?? {
    x: template.player.default?.at[0] ?? 0,
    z: (template.player.default?.at.at(-1) as number) ?? 0,
  };
  return physics.nav.nearestFree(start.x, start.z, 2.5) ?? [0, 0];
}

describe('every venue', () => {
  it('is a walkable one-room layout', () => {
    for (const id of VENUE_TEMPLATES) {
      const layout = placeLayoutFor(id);
      expect(layout.rooms, id).toHaveLength(1);
      expect(layout.rooms[0]?.template.id, id).toBe(id);
      expect(placeLayoutFor(id), `${id} stable`).toBe(layout);
    }
    expect(placeLayoutFor('home-mansion')).toBe(HOME_LAYOUTS['home-mansion']);
  });

  it('covers every venue type you can enter, and gives a new type a sensible room', () => {
    for (const type of VENUE_TYPES.filter((candidate) => candidate !== 'home')) {
      const venue = VENUES.find((candidate) => candidate.type === type);
      if (!venue) continue;
      const layout = placeLayoutFor(resolveTemplateId(venue.id));
      expect(layout.rooms.length, type).toBeGreaterThan(0);
    }
    expect(genericTemplateFor('bank')).toBe('office');
    expect(genericTemplateFor('beach-club')).toBe('club');
    expect(genericTemplateFor('rooftop-lounge')).toBe('bar');
    expect(genericTemplateFor('diagnostic-lab')).toBe('clinic');
  });

  it('offers every place action from a hotspot button or its “More here” list', () => {
    for (const id of VENUE_TEMPLATES) {
      const template = getTemplate(id);
      const actions = actionsAt({ kind: 'venue', venueType: venueTypeFor(id) }).filter(isPlaceAction);
      const reachable = new Set<string>();
      const services = servicesAt({ kind: 'venue', venueType: venueTypeFor(id) });
      for (const hotspot of buildHotspots(template, actions, template, services)) {
        const offer = hotspotInteractable(hotspot, () => ({ priceNote: '', reason: null }));
        const buttons = [offer, ...(offer?.more ?? [])];
        if (buttons.some((button) => button?.id === MORE_HERE_ID))
          for (const action of hotspot.actions) reachable.add(action.id);
        for (const button of buttons) {
          const actionId = button ? actionOfInteractable(button.id) : null;
          if (actionId) reachable.add(actionId);
        }
      }
      for (const action of actions) expect(reachable.has(action.id), `${id}: ${action.id}`).toBe(true);
    }
  });

  it('never puts you where an NPC or another player already is', () => {
    for (const id of VENUE_TEMPLATES) {
      const template = getTemplate(id as InteriorTemplateId);
      const occupied = occupiedFeet(template);
      for (const candidate of actionsAt({ kind: 'venue', venueType: venueTypeFor(id) }).filter(
        isPlaceAction,
      )) {
        const spot = foot(actionSpot(template, candidate));
        expect
          .soft(
            occupied.some((person) => near(person, spot, 0.3)),
            `${id}: ${candidate.id} at ${spot.join(', ')}`,
          )
          .toBe(false);
      }
    }
  });

  it('can reach every hotspot and every action’s spot from the entrance, around NPCs and other players', () => {
    for (const id of VENUE_TEMPLATES) {
      const template = getTemplate(id as InteriorTemplateId);
      const venueType = venueTypeFor(id);
      expect(venueType, id).not.toBeNull();
      const actions = actionsAt({ kind: 'venue', venueType }).filter(isPlaceAction);
      const physics = buildRoomPhysics(template, occupiedFeet(template));
      const from = entrance(template, physics);
      const services = servicesAt({ kind: 'venue', venueType: venueTypeFor(id) });
      for (const hotspot of buildHotspots(template, actions, template, services)) {
        // You stand beside the thing, on the side you come from (a bar is long).
        const [cx, cz] = closestOnBox(hotspot.box, from[0], from[1]);
        const target = physics.nav.nearestFree(cx, cz, hotspot.reach + 0.6);
        expect.soft(target, `${id}: stand by ${hotspot.id}`).not.toBeNull();
        if (target)
          expect.soft(physics.nav.findPath(from, target), `${id}: walk to ${hotspot.id}`).not.toBeNull();
      }
      for (const candidate of actions) {
        if (
          AVATAR_CLIPS[candidate.animation].kind === 'full' &&
          ['walk', 'idle'].includes(candidate.animation)
        )
          continue;
        const spot = actionSpot(template, candidate);
        const approach = approachPoint(physics.nav, spot);
        expect.soft(approach, `${id}: approach ${candidate.id}`).not.toBeNull();
        if (approach)
          expect.soft(physics.nav.findPath(from, approach), `${id}: walk to ${candidate.id}`).not.toBeNull();
      }
    }
  });
});

describe('walking to a hotspot', () => {
  afterEach(() => resetControls());
  const run = (runtime: HomeWalkRuntime, seconds: number): void => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    for (let t = 0; t < seconds; t += 1 / 30) runtime.frame(camera, 1 / 30, t * 1000, 800, 600);
  };
  const enterBar = () => {
    const template = getTemplate('bar');
    const room = placeLayoutFor('bar').rooms[0]!;
    const portals = room.portals.map((spec) => portalGeometry(template, spec));
    const runtime = new HomeWalkRuntime();
    runtime.loadRoom(
      { roomId: room.id, template, physics: buildRoomPhysics(template, occupiedFeet(template)), portals },
      { kind: 'enter' },
      1,
    );
    const hotspots = buildHotspots(
      template,
      actionsAt({ kind: 'venue', venueType: 'bar' }).filter(isPlaceAction),
    );
    runtime.setHotspots(hotspots, false);
    return { runtime, template, hotspots };
  };

  it('walks up to a tapped marker, offering it on the way and when there', () => {
    const { runtime } = enterBar();
    run(runtime, 0.2);
    expect(runtime.offered).not.toBe('hotspot:lounge');
    expect(runtime.goToHotspot('hotspot:lounge')).toBe(true);
    run(runtime, 0.1);
    expect(runtime.phase).toBe('walking');
    expect(runtime.offered).toBe('hotspot:lounge');
    run(runtime, 9);
    expect(runtime.phase).toBe('free');
    expect(runtime.offered).toBe('hotspot:lounge');
  });

  it('offers nothing while something you chose is running, and drops a tapped marker when you steer away', () => {
    const { runtime, hotspots } = enterBar();
    runtime.goToHotspot('hotspot:lounge');
    run(runtime, 0.3);
    controls.stickX = 1;
    run(runtime, 0.2);
    controls.stickX = 0;
    expect(runtime.phase).toBe('free');
    runtime.setHotspots(hotspots, true);
    run(runtime, 0.1);
    expect(runtime.offered).toBeNull();
    expect(runtime.goToHotspot('hotspot:lounge')).toBe(false);
  });

  it('walks to the stool when the drink starts and sits at the bar', () => {
    const { runtime, template } = enterBar();
    const spot = actionSpot(template, action('lounge'));
    runtime.setActivity({ animation: 'drink', spot, via: null });
    run(runtime, 10);
    expect(runtime.phase).toBe('engaged');
    expect(runtime.pose.x).toBeCloseTo(spot.at[0]);
    expect(runtime.pose.y).toBeCloseTo(spot.at[1] as number);
    expect(runtime.offered).toBeNull();
    // The camera comes round to see their face (and the glass), not the back of their head.
    run(runtime, 3);
    const forward = { x: 0, z: 0 };
    runtime.camera.forward(forward);
    const facing = ((spot.rot ?? 0) * Math.PI) / 180;
    expect(forward.x * Math.sin(facing) + forward.z * Math.cos(facing)).toBeLessThan(-0.3);
  });
});

describe('things you can tap', () => {
  const names = (id: InteriorTemplateId): string[] =>
    roomObjects(getTemplate(id)).map((object) => object.name);

  it('finds the bar, the DJ booth, the dance floor, beds, desks, machines, shelves, cars and pews', () => {
    expect(names('bar')).toEqual(expect.arrayContaining(['Bar', 'Sofa', 'Table', 'TV']));
    expect(names('club')).toEqual(expect.arrayContaining(['Bar', 'DJ booth', 'Dance floor', 'Stage']));
    expect(names('hospital-ward')).toEqual(expect.arrayContaining(['Hospital bed', 'Nurses’ station']));
    expect(names('gym')).toEqual(
      expect.arrayContaining(['Treadmill', 'Bench press', 'Weights', 'Exercise mat']),
    );
    expect(names('mall')).toEqual(expect.arrayContaining(['Clothes rail', 'Till']));
    expect(names('car-dealer')).toContain('Car on show');
    expect(names('church')).toEqual(expect.arrayContaining(['Pew', 'Pulpit']));
    expect(names('mosque')).toContain('Prayer mat');
  });

  it('names each hotspot after the thing it’s at', () => {
    const at = (id: InteriorTemplateId, actionId: string): string | undefined =>
      buildHotspots(getTemplate(id), [action(actionId)]).find(
        (hotspot) => hotspot.actions[0]?.id === actionId,
      )?.name;
    expect(at('bar', 'lounge')).toBe('Bar');
    expect(at('club', 'club-night')).toBe('Dance floor');
    expect(at('restaurant', 'fine-dining')).toBe('Table');
    expect(at('gym', 'gym')).toBe('Exercise mat');
    expect(at('church', 'worship')).toBe('Pew');
    expect(at('mosque', 'worship')).toBe('Prayer mat');
    expect(at('campus', 'study')).not.toBe('Chair');
  });

  it('hits a box with a ray, nearest first', () => {
    const box = { minX: -1, maxX: 1, minY: 0, maxY: 1, minZ: -1, maxZ: 1 };
    expect(rayHitsBox(0, 5, 0, 0, -1, 0, box)).toBeCloseTo(4);
    expect(rayHitsBox(3, 0.5, 0, -1, 0, 0, box)).toBeCloseTo(2);
    expect(rayHitsBox(3, 2, 0, -1, 0, 0, box)).toBeNull();
    expect(rayHitsBox(3, 1.1, 0, -1, 0, 0, box, 0.2)).toBeCloseTo(1.8);
  });

  it('shows a thing’s card: name, price, time, what it does, why not, and the goal it serves', () => {
    const bar = buildHotspots(
      getTemplate('bar'),
      actionsAt({ kind: 'venue', venueType: 'bar' }).filter(isPlaceAction),
    );
    const drinks = bar.find((hotspot) => hotspot.name === 'Bar') as Hotspot;
    const card = hotspotCard(drinks, () => ({ priceNote: '₦18,000', reason: 'Not enough money (₦18,000)' }));
    // Both of the bar's drinks actions.
    expect(card).toMatchObject({ name: 'Bar', emoji: '🍹', count: 2, goal: null });
    expect(card.entries[1]).toMatchObject({ label: 'Cocktails & small chops' });
    expect(card.entries[0]).toMatchObject({
      id: 'hotspot:lounge',
      label: 'Drinks at the lounge',
      priceNote: '₦18,000',
      durations: [60, 90],
      disabled: 'Not enough money (₦18,000)',
      opens: null,
    });
    expect(card.entries[0]?.effects).toEqual(expect.arrayContaining(['Fun ↑', 'Social ↑', 'Energy ↓']));
  });

  it('puts what a life goal needs first, and marks it', () => {
    const buka = getTemplate('buka');
    const actions = actionsAt({ kind: 'venue', venueType: 'buka' }).filter(isPlaceAction);
    const goal = {
      goalId: 'make-a-friend',
      title: 'Make a friend',
      actionId: 'meet-people',
      serviceId: null,
      service: null,
      label: 'Mingle',
    };
    const hotspots = buildHotspots(buka, actions, buka, [], goal);
    const marked = hotspots.filter((hotspot) => holdsGoal(hotspot, goal));
    expect(marked).toHaveLength(1);
    expect(marked[0]?.actions[0]?.id).toBe('meet-people');
    const card = hotspotCard(marked[0] as Hotspot, () => ({ priceNote: '', reason: null }), goal);
    expect(card.goal).toBe('Make a friend');
    expect(card.entries[0]?.goal).toBe(true);
  });

  it('makes every treadmill, pew and table do what the one with the marker does', () => {
    const gym = buildHotspots(
      getTemplate('gym'),
      actionsAt({ kind: 'venue', venueType: 'gym' }).filter(isPlaceAction),
    );
    const workout = gym.find((hotspot) =>
      hotspot.actions.some((candidate) => candidate.id === 'gym'),
    ) as Hotspot;
    // Three treadmills, the bench press or the weights, the bag: all start a gym session.
    expect(workout.aliases.length).toBeGreaterThanOrEqual(4);
    const church = buildHotspots(
      getTemplate('church'),
      actionsAt({ kind: 'venue', venueType: 'church' }).filter(isPlaceAction),
    );
    const pews = church.find((hotspot) => hotspot.kind === 'pew') as Hotspot;
    expect(pews.aliases.length).toBe(7);
    // The church's own service comes before mingling (which works in a dozen places).
    expect(pews.actions[0]?.id).toBe('worship');
    // Standing by any pew offers it.
    const far = pews.aliases.at(-1) as Hotspot['box'];
    expect(hotspotAt(church, (far.minX + far.maxX) / 2, far.maxZ + 0.2)?.id).toBe(pews.id);
  });

  it('gives club features a hook: a service at the DJ booth makes the booth a hotspot', () => {
    const club = getTemplate('club');
    const shoutout = {
      id: 'shoutout',
      label: 'Shoutout on the screen',
      emoji: '📣',
      blurb: 'Your name in lights.',
      opens: { panel: 'club-shoutout' },
      at: { object: 'dj-booth' as const },
    };
    const booth = buildHotspots(club, [], club, [shoutout]).find(
      (hotspot) => hotspot.services[0]?.id === 'shoutout',
    );
    expect(booth).toMatchObject({ kind: 'dj-booth', name: 'DJ booth' });
  });

  it('wires the night out into real clubs: shoutouts at the DJ booth, bottles at the bar', () => {
    const club = getTemplate('club');
    const services = PLACE_SERVICES.club ?? [];
    const hotspots = buildHotspots(club, [], club, services);
    const holding = (id: string) =>
      hotspots.find((hotspot) => hotspot.services.some((service) => service.id === id));
    expect(holding('dj-shoutout')).toMatchObject({ kind: 'dj-booth' });
    expect(holding('send-a-bottle')).toMatchObject({ kind: 'bar' });
    expect(services.find((service) => service.id === 'dj-shoutout')?.opens).toEqual({
      app: 'gist',
      param: 'night-out:shoutout',
    });
  });
});

describe('tapping things in 3D', () => {
  it('opens the card of the thing a tap lands on, on the walk camera', () => {
    const template = getTemplate('bar');
    const room = placeLayoutFor('bar').rooms[0]!;
    const runtime = new HomeWalkRuntime();
    runtime.loadRoom(
      {
        roomId: room.id,
        template,
        physics: buildRoomPhysics(template, occupiedFeet(template)),
        portals: room.portals.map((spec) => portalGeometry(template, spec)),
      },
      { kind: 'enter' },
      1,
    );
    const hotspots = buildHotspots(
      template,
      actionsAt({ kind: 'venue', venueType: 'bar' }).filter(isPlaceAction),
    );
    runtime.setHotspots(hotspots, false);
    const picked: string[] = [];
    runtime.setEvents({ onPortal: () => false, onStep: () => undefined, onPick: (id) => picked.push(id) });
    const bar = hotspots.find((hotspot) => hotspot.name === 'Bar') as Hotspot;
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(2, 4, 4);
    camera.lookAt(bar.at[0], 0.5, bar.at[1]);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    runtime.setCameraMode('overview');
    const centre = new Vector3(bar.at[0], 0.6, bar.at[1]).project(camera);
    controls.taps.push({ x: centre.x, y: centre.y });
    runtime.setCameraMode('walk');
    // The walk camera repositions itself first; tap where the bar is from where it ends up.
    controls.taps.length = 0;
    runtime.frame(camera, 1 / 30, 0, 800, 800);
    const seen = new Vector3(bar.at[0], 0.6, bar.at[1]).project(camera);
    controls.taps.push({ x: seen.x, y: seen.y });
    runtime.frame(camera, 1 / 30, 33, 800, 800);
    expect(picked).toEqual([bar.id]);
    resetControls();
  });
});
