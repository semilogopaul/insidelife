import type { DistrictId, RegionId } from './geography.js';

/**
 * Venues are the places a character can be. Actions, shops and jobs reference venue *types* (so new venues slot in
 * without code changes) or specific venue ids (workplaces, campuses).
 */
export const VENUE_TYPES = [
  'home',
  'campus',
  'office',
  'market',
  'mall',
  'hospital-public',
  'hospital-private',
  'pharmacy',
  'gym',
  'bar',
  'club',
  'buka',
  'restaurant',
  'beach',
  'park',
  'cbt-centre',
  'airport',
  'motor-park',
  'event-centre',
  'estate-agency',
  'car-dealer',
  'church',
  'mosque',
  'cinema',
  'salon',
  'government',
  'school',
  'mansion',
  'private-jet',
  'refinery',
  'stadium',
] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

export interface VenueDefinition {
  readonly id: string;
  readonly name: string;
  readonly type: VenueType;
  readonly districtId: DistrictId;
  /** Region for out-of-town venues (campuses outside Lagos). Defaults to Lagos. */
  readonly regionId?: RegionId;
  readonly blurb: string;
  /** Minimum status (clout) to get past the gate. */
  readonly minStatus?: number;
  /** Opening hours [open, close) in game hours; close may exceed 24 for late nights. Omitted = always open. */
  readonly hours?: readonly [number, number];
}

const v = (def: VenueDefinition): VenueDefinition => def;

export const VENUES = [
  // Ikeja
  v({ id: 'mmia-airport', name: 'Murtala Muhammed Airport', type: 'airport', districtId: 'ikeja', blurb: 'Japa terminal. Also Dubai.' }),
  v({ id: 'computer-village', name: 'Computer Village', type: 'market', districtId: 'ikeja', blurb: 'Phones, laptops and "original" chargers.', hours: [8, 19] }),
  v({ id: 'ikeja-city-mall', name: 'Ikeja City Mall', type: 'mall', districtId: 'ikeja', blurb: 'Shopping, cinema and AC.', hours: [9, 22] }),
  v({ id: 'ikeja-cinema', name: 'Ikeja Cinemas', type: 'cinema', districtId: 'ikeja', blurb: 'Nollywood premieres and popcorn.', hours: [10, 24] }),
  v({ id: 'alausa-secretariat', name: 'Alausa Secretariat', type: 'government', districtId: 'ikeja', blurb: 'Lagos State civil service. Oga is not on seat.', hours: [8, 17] }),
  v({ id: 'cbt-ikeja', name: 'Ikeja CBT Centre', type: 'cbt-centre', districtId: 'ikeja', blurb: 'JAMB, WAEC GCE and the dreaded server downtime.', hours: [7, 18] }),
  v({ id: 'berger-car-market', name: 'Berger Car Mart', type: 'car-dealer', districtId: 'ikeja', blurb: 'Tokunbo and Naija-used rides.', hours: [8, 18] }),
  v({ id: 'ikeja-gra-lounge', name: 'GRA Lounge', type: 'bar', districtId: 'ikeja', blurb: 'Suya, chapman and gist.', hours: [12, 26] }),
  v({ id: 'lasuth', name: 'LASUTH', type: 'hospital-public', districtId: 'ikeja', blurb: 'State teaching hospital. Bring patience.' }),
  v({ id: 'anchor', name: 'Anchor University', type: 'campus', districtId: 'mushin', blurb: 'Private campus at Ayobo, in the Alimosho corridor.' }),

  v({ id: 'new-afrika-shrine', name: 'New Afrika Shrine', type: 'bar', districtId: 'ikeja', blurb: 'Fela’s house: live Afrobeat, cold drinks, Thursday and Sunday jump.', hours: [16, 28] }),
  v({ id: 'allen-nights', name: 'Allen Avenue Nights', type: 'club', districtId: 'ikeja', blurb: 'Mainland turn-up: loud DJ, cheap bottles, no dress code.', minStatus: 30, hours: [22, 30] }),

  // Yaba
  v({ id: 'yaba-left-joint', name: 'Yaba Left Joint', type: 'bar', districtId: 'yaba', blurb: 'Students, pepper soup, cold Star and football on the big screen.', hours: [12, 26] }),
  v({ id: 'unilag', name: 'University of Lagos', type: 'campus', districtId: 'yaba', blurb: 'University of First Choice and the Nation’s Pride.' }),
  v({ id: 'yabatech', name: 'Yaba College of Technology', type: 'campus', districtId: 'yaba', blurb: 'ND, HND and serious practicals.' }),
  v({ id: 'fce-akoka', name: 'Federal College of Education (Technical), Akoka', type: 'campus', districtId: 'yaba', blurb: 'Teacher training beside the lagoon.' }),
  v({ id: 'yaba-market', name: 'Yaba Market', type: 'market', districtId: 'yaba', blurb: 'Okrika heaven. Dig well, look fresh.', hours: [8, 19] }),
  v({ id: 'yaba-hub', name: 'Yaba Tech Hub', type: 'office', districtId: 'yaba', blurb: 'Startups, hackathons and free Wi-Fi.', hours: [7, 23] }),
  v({ id: 'cbt-yaba', name: 'Yaba CBT Centre', type: 'cbt-centre', districtId: 'yaba', blurb: 'JAMB registration and exams.', hours: [7, 18] }),
  v({ id: 'yaba-gym', name: 'Iron Paradise Gym', type: 'gym', districtId: 'yaba', blurb: 'No-nonsense gym, ₦20k a month.', hours: [5, 22] }),
  v({ id: 'yaba-salon', name: 'Sabo Cuts & Braids', type: 'salon', districtId: 'yaba', blurb: 'Low cut, fade, knotless braids.', hours: [8, 21] }),

  // Mushin
  v({ id: 'luth', name: 'LUTH (Idi-Araba)', type: 'hospital-public', districtId: 'mushin', blurb: 'Lagos University Teaching Hospital.' }),
  v({ id: 'mushin-market', name: 'Mushin Market', type: 'market', districtId: 'mushin', blurb: 'Everything, cheaper, louder.', hours: [7, 19] }),
  v({ id: 'mushin-pharmacy', name: 'Iya Oloogun Pharmacy', type: 'pharmacy', districtId: 'mushin', blurb: 'Self-medication starts here.', hours: [7, 22] }),

  // Surulere
  v({ id: 'national-stadium', name: 'National Stadium', type: 'stadium', districtId: 'surulere', blurb: 'Jog the tracks, play ball, feel 1990s glory. Home ground of Lagos football: academy trials, NPFL training and match days.' }),
  v({ id: 'shitta-amala', name: 'Shitta Amala Joint', type: 'buka', districtId: 'surulere', blurb: 'Amala, gbegiri, ewedu. Legendary queue.', hours: [9, 21] }),
  v({ id: 'surulere-clinic', name: 'Bode Thomas Clinic', type: 'hospital-private', districtId: 'surulere', blurb: 'Neighbourhood private clinic.', hours: [0, 24] }),
  v({ id: 'surulere-school', name: 'Adeniran Memorial Schools', type: 'school', districtId: 'surulere', blurb: 'Nursery, primary and secondary.', hours: [7, 17] }),
  v({ id: 'surulere-church', name: 'Grace Assembly Surulere', type: 'church', districtId: 'surulere', blurb: 'Sunday service and vigil.', hours: [6, 22] }),

  // Ojo
  v({ id: 'lasu', name: 'Lagos State University', type: 'campus', districtId: 'ojo', blurb: 'LASU — indigenes pay less.' }),
  v({ id: 'ekounimed', name: 'Eko University of Medicine and Health Sciences', type: 'campus', districtId: 'ojo', blurb: 'Medicine and health sciences at Ijanikin.' }),

  // Ikorodu
  v({ id: 'ikorodu-garage', name: 'Ikorodu Garage', type: 'motor-park', districtId: 'ikorodu', blurb: 'Danfo, BRT and agberos.' }),
  v({ id: 'lasustech', name: 'Lagos State University of Science and Technology', type: 'campus', districtId: 'ikorodu', blurb: 'LASUSTECH, Ikorodu: the state’s science and tech campus.' }),
  v({ id: 'caleb', name: 'Caleb University', type: 'campus', districtId: 'ikorodu', blurb: 'Private campus at Imota, off the Ikorodu road.' }),

  // Lagos Island
  v({ id: 'balogun-market', name: 'Balogun Market', type: 'market', districtId: 'lagos-island', blurb: 'Fabrics, shoes, haggling Olympics.', hours: [8, 18] }),
  v({ id: 'marina', name: 'Marina Business District', type: 'office', districtId: 'lagos-island', blurb: 'Bank HQs and law chambers.', hours: [7, 20] }),
  v({ id: 'lagos-general-hospital', name: 'Lagos Island General Hospital', type: 'hospital-public', districtId: 'lagos-island', blurb: 'Busy public hospital.' }),
  v({ id: 'freedom-park', name: 'Freedom Park', type: 'park', districtId: 'lagos-island', blurb: 'Art, live music and history.', hours: [9, 24] }),
  v({ id: 'central-mosque', name: 'Lagos Central Mosque', type: 'mosque', districtId: 'lagos-island', blurb: 'Jumu’ah prayers on Friday.', hours: [4, 22] }),
  v({ id: 'cms-motor-park', name: 'CMS Bus Terminal', type: 'motor-park', districtId: 'lagos-island', blurb: 'BRT and interstate buses.' }),

  // Ikoyi
  v({ id: 'ikoyi-club', name: 'Ikoyi Club 1938', type: 'gym', districtId: 'ikoyi', blurb: 'Members-only gym, golf and connections.', minStatus: 450, hours: [5, 23] }),
  v({ id: 'immigration-ikoyi', name: 'Ikoyi Passport Office', type: 'government', districtId: 'ikoyi', blurb: 'Passports. Mind the "help" at the gate.', hours: [8, 16] }),
  v({ id: 'ikoyi-fine-dining', name: 'Kowry Ikoyi', type: 'restaurant', districtId: 'ikoyi', blurb: 'Tasting menus for people who say "jollof deconstructed".', hours: [12, 24] }),
  v({ id: 'ikoyi-estate-agency', name: 'Ikoyi Realty', type: 'estate-agency', districtId: 'ikoyi', blurb: 'Rentals, land with real C of O.', hours: [8, 18] }),

  v({ id: 'bourdillon-lounge', name: 'Bourdillon Lounge', type: 'bar', districtId: 'ikoyi', blurb: 'Wine, cocktails and quiet money.', minStatus: 150, hours: [14, 26] }),
  // Public showcase: walk in, watch a film in the cinema, play FIFA, record in the studio. The jet never flies.
  v({ id: 'obo-mansion', name: 'OBO Mansion', type: 'mansion', districtId: 'ikoyi', blurb: 'Open house at OBO’s: a cinema, a studio, a games room and a lot of gold.', hours: [8, 22] }),
  v({ id: 'air-obo', name: 'AIR OBO', type: 'private-jet', districtId: 'ikoyi', blurb: 'OBO’s private jet, parked on the pad beside the mansion. Climb aboard; it’s not going anywhere.', hours: [8, 22] }),

  // Victoria Island
  v({ id: 'eko-hotel', name: 'Eko Hotel & Suites', type: 'event-centre', districtId: 'victoria-island', blurb: 'Weddings, concerts and society owambes.' }),
  v({ id: 'the-vault', name: 'The Vault VI', type: 'club', districtId: 'victoria-island', blurb: 'Bottle service, sparklers, EFCC raids.', minStatus: 250, hours: [22, 30] }),
  v({ id: 'vi-lounge', name: 'Ozumba Rooftop Lounge', type: 'bar', districtId: 'victoria-island', blurb: 'Afterwork drinks with a skyline.', hours: [14, 27] }),
  v({ id: 'eko-atlantic', name: 'Eko Atlantic Towers', type: 'office', districtId: 'victoria-island', blurb: 'Oil, gas and glass towers on reclaimed land.', hours: [7, 21] }),
  v({ id: 'island-specialist', name: 'Island Specialist Hospital', type: 'hospital-private', districtId: 'victoria-island', blurb: 'Premium private care. Premium bills.' }),
  v({ id: 'polanco-motors', name: 'Polanco', type: 'car-dealer', districtId: 'victoria-island', blurb: 'Ahmadu Bello Way showroom: brand-new and clean tokunbo, from daily drivers to the SUVs on every Island driveway.', hours: [9, 19] }),
  v({ id: 'tarkwa-bay', name: 'Tarkwa Bay', type: 'beach', districtId: 'victoria-island', blurb: 'Boat ride, quiet sand, fresh fish.', hours: [8, 19] }),

  v({ id: 'quilox', name: 'Quilox', type: 'club', districtId: 'victoria-island', blurb: 'Ozumba Mbadiwe’s most famous door: LED walls, bottle parades, celebrities in VIP.', minStatus: 350, hours: [23, 31] }),
  v({ id: 'cubana-lagos', name: 'Cubana Lagos', type: 'club', districtId: 'victoria-island', blurb: 'Owambe energy after midnight. A sparkler on every bottle.', minStatus: 250, hours: [22, 30] }),
  v({ id: 'club-57', name: 'Club 57', type: 'club', districtId: 'victoria-island', blurb: 'Afrobeats DJs and Detty December’s longest queue.', minStatus: 200, hours: [22, 30] }),

  // Lekki
  v({ id: 'lekki-rooftop', name: 'Admiralty Rooftop Bar', type: 'bar', districtId: 'lekki', blurb: 'Sunset cocktails over the lagoon, afrobeats after dark.', hours: [15, 27] }),
  v({ id: 'admiralty-nights', name: 'Admiralty Nights', type: 'club', districtId: 'lekki', blurb: 'Lekki’s Friday spot: amapiano and girls’-night tables.', minStatus: 80, hours: [22, 30] }),
  v({ id: 'elegushi-beach', name: 'Elegushi Beach', type: 'beach', districtId: 'lekki', blurb: 'Horses, suya, loud speakers.', hours: [8, 26] }),
  v({ id: 'lekki-conservation', name: 'Lekki Conservation Centre', type: 'park', districtId: 'lekki', blurb: 'The canopy walk. Monkeys judge you.', hours: [8, 17] }),
  v({ id: 'lekki-mall', name: 'Lekki Circle Mall', type: 'mall', districtId: 'lekki', blurb: 'Designer stores and Shoprite.', hours: [9, 22] }),
  v({ id: 'lekki-gym', name: 'Lekki Fitness Studio', type: 'gym', districtId: 'lekki', blurb: 'Pilates, spin and influencers.', hours: [5, 22] }),
  v({ id: 'lekki-car-mart', name: 'Lekki Auto Gallery', type: 'car-dealer', districtId: 'lekki', blurb: 'Brand-new and clean tokunbo luxury.', hours: [9, 19] }),
  v({ id: 'lekki-estate-agency', name: 'Lekki Homes & Land', type: 'estate-agency', districtId: 'lekki', blurb: 'From mini flats to Banana Island.', hours: [8, 18] }),
  v({ id: 'lekki-church', name: 'Covenant Hall Lekki', type: 'church', districtId: 'lekki', blurb: 'Mega-church, mega car park.', hours: [6, 22] }),

  // Ajah
  v({ id: 'pan-atlantic', name: 'Pan-Atlantic University', type: 'campus', districtId: 'ajah', blurb: 'Small classes, big fees.' }),
  v({ id: 'ajah-market', name: 'Ajah Market', type: 'market', districtId: 'ajah', blurb: 'Fresh food and fabric on the Lekki-Epe road.', hours: [7, 19] }),

  // Epe & Ibeju-Lekki
  v({ id: 'epe-land-office', name: 'Epe Land Bureau', type: 'estate-agency', districtId: 'epe', blurb: 'Plots, surveys and family-land wahala.', hours: [8, 17] }),
  v({ id: 'augustine', name: 'Augustine University', type: 'campus', districtId: 'epe', blurb: 'Catholic private university at Ilara-Epe.' }),
  v({ id: 'dangote-refinery', name: 'Dangote Refinery', type: 'refinery', districtId: 'epe', blurb: 'Africa’s biggest refinery on the Lekki lagoon. The visitor centre runs tours by day.', hours: [8, 17] }),
] as const satisfies readonly VenueDefinition[];

export type VenueId = (typeof VENUES)[number]['id'];

const VENUE_INDEX: ReadonlyMap<string, VenueDefinition> = new Map(VENUES.map((venue) => [venue.id, venue]));

export function findVenue(id: string): VenueDefinition | undefined {
  return VENUE_INDEX.get(id);
}

export function venuesOfType(type: VenueType): VenueDefinition[] {
  return VENUES.filter((venue) => venue.type === type);
}

/** True if the venue is open at the given hour of day (0-23). */
export function isVenueOpen(venue: VenueDefinition, hour: number): boolean {
  if (!venue.hours) return true;
  const [open, close] = venue.hours;
  if (close <= 24) return hour >= open && hour < close;
  return hour >= open || hour < close - 24;
}

/** A short wait at the door is fine: a venue opening this soon after you arrive doesn't count as closed (minutes). */
export const OPENING_GRACE_MINUTES = 30;

/**
 * Will a venue be shut when you get there (game minute `arriveAt`, a ride's arrival)? The hour it opens next, or null
 * when it's open then — or opens within `OPENING_GRACE_MINUTES` of your arrival.
 */
export function closedOnArrival(venue: VenueDefinition, arriveAt: number): number | null {
  if (!venue.hours) return null;
  const hourAt = (minute: number): number => Math.floor((((minute % 1440) + 1440) % 1440) / 60);
  if (isVenueOpen(venue, hourAt(arriveAt)) || isVenueOpen(venue, hourAt(arriveAt + OPENING_GRACE_MINUTES))) return null;
  return venue.hours[0] % 24;
}

/**
 * A character's home is not a catalog venue: it is identified as `home:<characterId>` at runtime. This helper keeps
 * that convention in one place.
 */
export const HOME_LOCATION_PREFIX = 'home:';
export function homeLocationId(characterId: string): string {
  return `${HOME_LOCATION_PREFIX}${characterId}`;
}
export function isHomeLocation(locationId: string): boolean {
  return locationId.startsWith(HOME_LOCATION_PREFIX);
}

/**
 * Out in the open world (walking or driving), the character is `street:<districtId>`; the exact coordinates live in
 * realtime presence, not in the database.
 */
export const STREET_LOCATION_PREFIX = 'street:';
export function streetLocationId(districtId: DistrictId): string {
  return `${STREET_LOCATION_PREFIX}${districtId}`;
}
export function isStreetLocation(locationId: string): boolean {
  return locationId.startsWith(STREET_LOCATION_PREFIX);
}
export function streetDistrict(locationId: string): DistrictId | null {
  return isStreetLocation(locationId) ? (locationId.slice(STREET_LOCATION_PREFIX.length) as DistrictId) : null;
}
