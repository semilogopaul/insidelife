import type { VenueType } from '@insidelife/shared';
import { gameEvents } from '@/common/game/game-events';
import { useUi, type PhoneApp } from '@/common/game/ui-store';
import type { PlaceKind } from './place-actions';

/**
 * What a place offers that isn't a timed action from the catalog: browse the cars at a showroom (Motors), see a doctor
 * at the hospital's front desk (Health), listings at an estate agency (Homes)… Shown where they happen like any hotspot
 * and listed in "Things to do here"; choosing one opens a phone app on the right tab, or a panel.
 *
 * **Hook for place features with their own UI** (e.g. club nights: bottles for people at the bar, shoutouts at the DJ
 * booth): add an entry to `PLACE_SERVICES` for the venue type with `at: { object: 'dj-booth' }` (any
 * `PlaceObjectKind`) and `opens: { panel: 'club-shoutout' }`, then listen for it where the panel lives:
 * `gameEvents.on('open-panel', ({ panel, venueId }) => …)`. The object gets a hotspot (tap it in 3D, walk up to it, or
 * find it in "Things to do here") as soon as it has an entry. By venue type, so new venues of a type get them free.
 */

/** Things in a room that hotspots attach to (the world reads them from the room's furniture and props). */
export const PLACE_OBJECT_KINDS = [
  'bar',
  'dj-booth',
  'dance-floor',
  'stage',
  'bed',
  'sofa',
  'table',
  'chair',
  'desk',
  'counter',
  'tv',
  'cooker',
  'shower',
  'pew',
  'mat',
  'gym-machine',
  'shelf',
  'stall',
  'car',
  'seats',
  'salon-chair',
  'pulpit',
  'bench',
  'toilet',
  'game',
  'exhibit',
  'studio',
  'spot',
] as const;
export type PlaceObjectKind = (typeof PLACE_OBJECT_KINDS)[number];

/** What choosing a service does: open a phone app (on a tab), or a panel another feature shows. */
export type ServiceTarget =
  { readonly app: Exclude<PhoneApp, 'home'>; readonly param?: string } | { readonly panel: string };

export interface PlaceService {
  readonly id: string;
  readonly label: string;
  readonly emoji: string;
  readonly blurb: string;
  readonly opens: ServiceTarget;
  /**
   * Where it's found in the room: the counter, the cars on show, the staffed desk (front desk, doctor, agent), or a
   * particular kind of object (the DJ booth, the bar). Falls back to the counter/desk when the room has no such thing.
   */
  readonly at: 'counter' | 'cars' | 'desk' | { readonly object: PlaceObjectKind };
}

/** "Opens Motors" / "Opens on your phone" for a service's button. */
export function serviceOpensLabel(service: PlaceService): string {
  if ('panel' in service.opens) return 'Open';
  const app = service.opens.app;
  return `Open ${app.charAt(0).toUpperCase()}${app.slice(1)}`;
}

const DOCTOR: PlaceService = {
  id: 'see-doctor',
  label: 'See a doctor',
  emoji: '🩺',
  blurb: 'Check-ups and treatment — in the Health app.',
  opens: { app: 'health', param: 'me' },
  at: 'desk',
};
const SCHOOL: PlaceService = {
  id: 'school-desk',
  label: 'Courses & exams',
  emoji: '🎓',
  blurb: 'Admissions, courses and exam registration — in the School app.',
  opens: { app: 'school' },
  at: 'desk',
};
const SHOP: PlaceService = {
  id: 'shop-here',
  label: 'Shop here',
  emoji: '🛍️',
  blurb: 'Clothes, gadgets and things for the house — in the Shop app.',
  opens: { app: 'shop' },
  at: 'counter',
};

// Night out (Gist → Here → Night out / Spray money): the bar sends bottles, the DJ booth takes shoutouts.
const SEND_A_BOTTLE: PlaceService = {
  id: 'send-a-bottle',
  label: 'Send a bottle',
  emoji: '🍾',
  blurb: 'Champagne, cognac or a sparkler parade for someone here — everyone sees it.',
  opens: { app: 'gist', param: 'night-out:bottles' },
  at: { object: 'bar' },
};
const DJ_SHOUTOUT: PlaceService = {
  id: 'dj-shoutout',
  label: 'DJ shoutout',
  emoji: '🎤',
  blurb: 'Your name, big and bold, on everyone’s screen in here.',
  opens: { app: 'gist', param: 'night-out:shoutout' },
  at: { object: 'dj-booth' },
};
const NIGHT_EXTRAS: PlaceService = {
  id: 'night-extras',
  label: 'Confetti, birthdays & VIP',
  emoji: '🎉',
  blurb: 'Confetti cannon, a birthday package, the VIP section with your name on it.',
  opens: { app: 'gist', param: 'night-out:experiences' },
  at: { object: 'dance-floor' },
};
const SPRAY_MONEY: PlaceService = {
  id: 'spray-money',
  label: 'Spray money',
  emoji: '💸',
  blurb: 'Make it rain on someone here (or the DJ).',
  opens: { app: 'gist', param: 'here' },
  at: { object: 'dance-floor' },
};
const NIGHT_OUT: readonly PlaceService[] = [SEND_A_BOTTLE, DJ_SHOUTOUT, NIGHT_EXTRAS, SPRAY_MONEY];

export const PLACE_SERVICES: Readonly<Partial<Record<VenueType, readonly PlaceService[]>>> = {
  club: NIGHT_OUT,
  bar: NIGHT_OUT,
  'event-centre': NIGHT_OUT,
  'car-dealer': [
    {
      id: 'browse-cars',
      label: 'Browse cars for sale',
      emoji: '🚗',
      blurb: 'Prices, specs and paint — buy in the Motors app.',
      opens: { app: 'motors', param: 'dealer' },
      at: 'cars',
    },
  ],
  'estate-agency': [
    {
      id: 'listings',
      label: 'See homes to rent or buy',
      emoji: '🏠',
      blurb: 'Flats to rent and houses to buy — in the Homes app.',
      opens: { app: 'homes', param: 'rent' },
      at: 'desk',
    },
  ],
  'hospital-public': [DOCTOR],
  'hospital-private': [DOCTOR],
  pharmacy: [
    {
      id: 'buy-medicine',
      label: 'Ask the pharmacist',
      emoji: '💊',
      blurb: 'Drugs for what ails you — in the Health app.',
      opens: { app: 'health', param: 'me' },
      at: 'counter',
    },
  ],
  'cbt-centre': [
    {
      id: 'exam-desk',
      label: 'Register for exams',
      emoji: '📝',
      blurb: 'JAMB, WAEC and GCE — in the School app.',
      opens: { app: 'school' },
      at: 'desk',
    },
  ],
  campus: [SCHOOL],
  school: [SCHOOL],
  mall: [SHOP],
  market: [SHOP],
  office: [
    {
      id: 'job-board',
      label: 'Jobs board',
      emoji: '💼',
      blurb: 'Openings and applications — in the Jobs app.',
      opens: { app: 'jobs', param: 'board' },
      at: 'desk',
    },
  ],
  government: [
    {
      id: 'licence',
      label: 'Driving licence',
      emoji: '🪪',
      blurb: 'Apply and book the FRSC test — in the Motors app.',
      opens: { app: 'motors', param: 'licence' },
      at: 'desk',
    },
  ],
  'motor-park': [
    {
      id: 'book-ride',
      label: 'Book a ride',
      emoji: '🚌',
      blurb: 'Danfo, BRT, keke or okada — pick a destination on the Map.',
      opens: { app: 'map' },
      at: 'counter',
    },
  ],
  'aviation-terminal': [
    {
      id: 'gat-flights',
      label: 'Flights',
      emoji: '✈️',
      blurb: 'Commercial flights and the coach, in the Flights app. Private flights and hangars come with the aircraft update.',
      opens: { app: 'flights' },
      at: 'counter',
    },
  ],
  airport: [
    {
      id: 'ticket-counter',
      label: 'Ticket counter & gate',
      emoji: '🎫',
      blurb: 'Walk-up tickets, check-in and boarding — in the Flights app.',
      opens: { app: 'flights', param: 'counter' },
      at: 'counter',
    },
    {
      id: 'book-trip',
      label: 'Travel',
      emoji: '✈️',
      blurb: 'Out of Lagos — pick a destination on the Map.',
      opens: { app: 'map' },
      at: 'counter',
    },
  ],
};

/** Services at a kind of place (homes have none). */
export function servicesAt(place: PlaceKind): readonly PlaceService[] {
  return place.kind === 'venue' && place.venueType ? (PLACE_SERVICES[place.venueType] ?? []) : [];
}

const PREFIX = 'service:';

/** The context-button id for a service. */
export const serviceInteractableId = (id: string): string => `${PREFIX}${id}`;

/** The service a context-button id opens, if it's one. */
export function serviceOfInteractable(interactableId: string): PlaceService | null {
  if (!interactableId.startsWith(PREFIX)) return null;
  const id = interactableId.slice(PREFIX.length);
  for (const services of Object.values(PLACE_SERVICES)) {
    const found = services?.find((service) => service.id === id);
    if (found) return found;
  }
  return null;
}

/** Choose a service: open its phone app on the right tab, or ask for its panel (`open-panel`). */
export function openService(service: PlaceService, locationId: string | null = null): void {
  gameEvents.emit('sfx', { id: 'ui-open' });
  const target = service.opens;
  if ('panel' in target)
    gameEvents.emit('open-panel', { panel: target.panel, serviceId: service.id, locationId });
  else useUi.getState().openPhone(target.app, target.param ?? null);
}
