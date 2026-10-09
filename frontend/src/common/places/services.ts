import type { VenueType } from '@insidelife/shared';
import type { PhoneApp } from '@/common/game/ui-store';
import type { PlaceKind } from './place-actions';

/**
 * What a place offers through one of your phone apps rather than as a timed action: browse the cars at a showroom
 * (Motors), see a doctor at the hospital's front desk (Health), listings at an estate agency (Homes)… Shown where they
 * happen like any hotspot and listed in "Things to do here"; choosing one opens the app on the right tab. By venue type,
 * so new venues of a type get them for free.
 */

export interface PlaceService {
  readonly id: string;
  readonly label: string;
  readonly emoji: string;
  readonly blurb: string;
  readonly app: Exclude<PhoneApp, 'home'>;
  /** Deep link into the app (a tab). */
  readonly param?: string;
  /** Where it's found in the room: the counter, the cars on show, or the desk/person you'd talk to. */
  readonly at: 'counter' | 'cars' | 'desk';
}

const DOCTOR: PlaceService = {
  id: 'see-doctor',
  label: 'See a doctor',
  emoji: '🩺',
  blurb: 'Check-ups and treatment — in the Health app.',
  app: 'health',
  param: 'me',
  at: 'desk',
};
const SCHOOL: PlaceService = {
  id: 'school-desk',
  label: 'Courses & exams',
  emoji: '🎓',
  blurb: 'Admissions, courses and exam registration — in the School app.',
  app: 'school',
  at: 'desk',
};
const SHOP: PlaceService = {
  id: 'shop-here',
  label: 'Shop here',
  emoji: '🛍️',
  blurb: 'Clothes, gadgets and things for the house — in the Shop app.',
  app: 'shop',
  at: 'counter',
};

export const PLACE_SERVICES: Readonly<Partial<Record<VenueType, readonly PlaceService[]>>> = {
  'car-dealer': [
    {
      id: 'browse-cars',
      label: 'Browse cars',
      emoji: '🚗',
      blurb: 'Prices, specs and paint — buy in the Motors app.',
      app: 'motors',
      param: 'dealer',
      at: 'cars',
    },
  ],
  'estate-agency': [
    {
      id: 'listings',
      label: 'See listings',
      emoji: '🏠',
      blurb: 'Flats to rent and houses to buy — in the Homes app.',
      app: 'homes',
      param: 'rent',
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
      app: 'health',
      param: 'me',
      at: 'counter',
    },
  ],
  'cbt-centre': [
    {
      id: 'exam-desk',
      label: 'Register for exams',
      emoji: '📝',
      blurb: 'JAMB, WAEC and GCE — in the School app.',
      app: 'school',
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
      app: 'jobs',
      param: 'board',
      at: 'desk',
    },
  ],
  government: [
    {
      id: 'licence',
      label: 'Driving licence',
      emoji: '🪪',
      blurb: 'Apply and book the FRSC test — in the Motors app.',
      app: 'motors',
      param: 'licence',
      at: 'desk',
    },
  ],
  'motor-park': [
    {
      id: 'book-ride',
      label: 'Book a ride',
      emoji: '🚌',
      blurb: 'Danfo, BRT, keke or okada — pick a destination on the Map.',
      app: 'map',
      at: 'counter',
    },
  ],
  airport: [
    {
      id: 'book-trip',
      label: 'Travel',
      emoji: '✈️',
      blurb: 'Out of Lagos — pick a destination on the Map.',
      app: 'map',
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
