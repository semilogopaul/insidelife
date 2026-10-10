/**
 * Onboarding catalog: the welcome note a new player sees once, and the "now live" prompt for featured places. Pure
 * and dependency-free; each prompt is shown once per account (the server remembers).
 */
import { findVenue } from './venues.js';

export const WELCOME_REACTIONS = ['i-dey-for-you', 'na-you-sabi'] as const;
export type WelcomeReaction = (typeof WELCOME_REACTIONS)[number];

export const WELCOME_NOTE = {
  title: 'A note from the Inside Life team',
  body: "Hello 👋 We built Inside Life to be super fun and immersive, and we'd love your support. Tell us what you love about the game and what you'd love to see, and we'll ship it ASAP. Let's make Inside Life fun for everyone. Much love 💛",
  reactions: [
    { id: 'i-dey-for-you', label: 'I dey for you' },
    { id: 'na-you-sabi', label: 'Na you sabi' },
  ],
} as const satisfies { readonly title: string; readonly body: string; readonly reactions: readonly { readonly id: WelcomeReaction; readonly label: string }[] };

export interface FeaturedPlace {
  /** Venue id in the venue catalog. The option stays hidden until that venue exists. */
  readonly venueId: string;
  readonly name: string;
}

/**
 * Places announced in the "now live" prompt. Add the venue to the venue catalog and it appears on its own; leave
 * the list empty to switch the prompt off.
 */
export const FEATURED_PLACES: readonly FeaturedPlace[] = [
  { venueId: 'obo-mansion', name: 'OBO Mansion' },
  { venueId: 'dangote-refinery', name: 'Dangote Refinery' },
];

/** Featured places whose venue exists in the catalog (pass your own list in tests). */
export function liveFeaturedPlaces(
  places: readonly FeaturedPlace[] = FEATURED_PLACES,
  exists: (venueId: string) => boolean = (venueId) => findVenue(venueId) !== undefined,
): readonly FeaturedPlace[] {
  return places.filter((place) => exists(place.venueId));
}

/** "OBO Mansion and Dangote Refinery are now live!" */
export function featuredHeadline(places: readonly FeaturedPlace[]): string {
  const names = places.map((place) => place.name);
  const list = names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${list} ${names.length === 1 ? 'is' : 'are'} now live!`;
}
