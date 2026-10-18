import { DISTRICTS, type CityId, type DistrictId } from './geography.js';

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
  'aviation-terminal',
  'motor-park',
  'event-centre',
  'hotel',
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
  // General Aviation Terminal: private flights, hangars, aircraft sales and the flight school (docs/MULTI_CITY.md).
  v({ id: 'mmia-gat', name: 'MMA2 General Aviation Terminal', type: 'aviation-terminal', districtId: 'ikeja', blurb: 'Private flights, hangars, aircraft sales and the flight school.' }),
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
  v({ id: 'eko-hotel', name: 'Eko Hotel & Suites', type: 'hotel', districtId: 'victoria-island', blurb: 'Weddings, concerts and society owambes, and rooms over the lagoon.' }),
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
  // Abuja skeleton: just enough to live there. The full city content is a later workstream.
  v({ id: 'naia-airport', name: 'Nnamdi Azikiwe International Airport', type: 'airport', districtId: 'lugbe', blurb: 'Abuja’s gateway on Airport Road: flights to Lagos, Port Harcourt and Dubai.' }),
  v({ id: 'naia-gat', name: 'Abuja General Aviation Terminal', type: 'aviation-terminal', districtId: 'lugbe', blurb: 'Private flights, hangars and charter desks beside the main terminal.' }),
  v({ id: 'wuse-market', name: 'Wuse Market', type: 'market', districtId: 'wuse', blurb: 'Abuja’s biggest open market: foodstuff, fabrics and hard bargains.', hours: [7, 19] }),
  v({ id: 'jabi-lake-mall', name: 'Jabi Lake Mall', type: 'mall', districtId: 'jabi', blurb: 'Shopping, cinema and the lake just outside.', hours: [9, 22] }),
  v({ id: 'garki-buka', name: 'Garki Local Buka', type: 'buka', districtId: 'garki', blurb: 'Tuwo shinkafa, moi-moi and fura da nono at civil-servant prices.', hours: [8, 21] }),
  v({ id: 'national-hospital-abuja', name: 'National Hospital Abuja', type: 'hospital-public', districtId: 'abuja-cbd', blurb: 'Federal teaching and referral hospital in the Central Area.' }),
  v({ id: 'central-area-towers', name: 'Central Area Business Towers', type: 'office', districtId: 'abuja-cbd', blurb: 'Banks, consultants and ministries’ favourite contractors.', hours: [7, 20] }),
  v({ id: 'garki-police-command', name: 'Garki Area Command (Police)', type: 'government', districtId: 'garki', blurb: 'Report it, get a case file number, bring your own pen.', hours: [0, 24] }),
  v({ id: 'maitama-realty', name: 'Maitama Realty', type: 'estate-agency', districtId: 'maitama', blurb: 'Abuja rentals and land with real C of O.', hours: [8, 18] }),
  v({ id: 'utako-motor-park', name: 'Utako Motor Park', type: 'motor-park', districtId: 'jabi', blurb: 'Interstate coaches to Lagos and everywhere else.' }),

  // Abuja, the full city (docs/MULTI_CITY.md): the Central Area, the districts and the satellite towns, real places by real names.
  // Central Business District
  v({ id: 'silverbird-galleria', name: 'Silverbird Galleria', type: 'mall', districtId: 'abuja-cbd', blurb: 'The Central Area’s big mall: designer shops, a food court and the cinema upstairs.', hours: [9, 22] }),
  v({ id: 'silverbird-cinemas-abuja', name: 'Silverbird Cinemas Abuja', type: 'cinema', districtId: 'abuja-cbd', blurb: 'Nollywood premieres, Hollywood blockbusters and popcorn on the Galleria’s top floor.', hours: [10, 24] }),
  v({ id: 'eagle-square', name: 'Eagle Square', type: 'park', districtId: 'abuja-cbd', blurb: 'Abuja’s parade ground: the flag, the fountains and every Independence Day since 1999.', hours: [6, 22] }),
  v({ id: 'national-mosque', name: 'Abuja National Mosque', type: 'mosque', districtId: 'abuja-cbd', blurb: 'The golden dome and four minarets. Jumu’ah draws thousands.', hours: [4, 22] }),
  v({ id: 'national-christian-centre', name: 'National Christian Centre', type: 'church', districtId: 'abuja-cbd', blurb: 'The interdenominational national church with the cross tower. Quiet on weekdays, full on Sundays.', hours: [6, 22] }),
  v({ id: 'federal-secretariat', name: 'Federal Secretariat Complex', type: 'government', districtId: 'abuja-cbd', blurb: 'Ministries in concrete towers: permanent secretaries, permanent files, “oga is in a meeting”.', hours: [8, 17] }),
  v({ id: 'nnpc-towers', name: 'NNPC Towers', type: 'office', districtId: 'abuja-cbd', blurb: 'Oil, gas and long meetings: the national oil company’s headquarters in the Central Area.', hours: [7, 20] }),
  v({ id: 'cbn-hq', name: 'Central Bank of Nigeria Headquarters', type: 'office', districtId: 'abuja-cbd', blurb: 'The naira’s guardians: monetary policy, circulars and a very tall lobby.', hours: [8, 18] }),
  v({ id: 'us-embassy-abuja', name: 'U.S. Embassy Abuja', type: 'government', districtId: 'abuja-cbd', blurb: 'Visa appointments, a long queue and a very high fence.', hours: [8, 16] }),
  v({ id: 'fraser-suites-abuja', name: 'Fraser Suites Abuja', type: 'hotel', districtId: 'abuja-cbd', blurb: 'Serviced suites in the Central Business District: a desk, a kitchenette and the ministries a short walk away.' }),
  v({ id: 'ceddi-plaza', name: 'Ceddi Plaza', type: 'mall', districtId: 'abuja-cbd', blurb: 'Offices, banks, restaurants and shops on Tafawa Balewa Way.', hours: [8, 20] }),

  // Maitama
  v({ id: 'transcorp-hilton', name: 'Transcorp Hilton Abuja', type: 'hotel', districtId: 'maitama', blurb: 'Presidents, delegations and weddings: the grand hotel on Aguiyi Ironsi Street.' }),
  v({ id: 'millennium-park', name: 'Millennium Park', type: 'park', districtId: 'maitama', blurb: 'Fountains, lawns and joggers in the park Queen Elizabeth opened.', hours: [6, 20] }),
  v({ id: 'uk-high-commission', name: 'British High Commission Abuja', type: 'government', districtId: 'maitama', blurb: 'Visas, passports and a very polite queue.', hours: [8, 16] }),
  v({ id: 'canada-high-commission', name: 'High Commission of Canada', type: 'government', districtId: 'maitama', blurb: 'Study permits, visas and Express Entry questions.', hours: [8, 16] }),
  v({ id: 'maitama-district-hospital', name: 'Maitama District Hospital', type: 'hospital-public', districtId: 'maitama', blurb: 'The district hospital that half of Abuja’s civil service queues at.' }),
  v({ id: 'jevinik-restaurant', name: 'Jevinik Restaurant', type: 'restaurant', districtId: 'maitama', blurb: 'Continental and Nigerian plates, linen napkins and ministers at lunch.', hours: [11, 23] }),
  v({ id: 'medplus-maitama', name: 'MedPlus Pharmacy Maitama', type: 'pharmacy', districtId: 'maitama', blurb: 'Branded pharmacy: prescriptions, skincare and a pharmacist who explains.', hours: [8, 22] }),

  // Wuse
  v({ id: 'banex-plaza', name: 'Banex Plaza', type: 'market', districtId: 'wuse', blurb: 'Abuja’s phone and gadget plaza in Wuse 2: new phones, “UK used” laptops and repairs.', hours: [9, 19] }),
  v({ id: 'play-imperial', name: 'Play Imperial', type: 'club', districtId: 'wuse', blurb: 'Adetokunbo Ademola Crescent’s iconic club: bottle service and the senator’s table.', minStatus: 150, hours: [22, 30] }),
  v({ id: 'sheraton-abuja', name: 'Sheraton Abuja Hotel', type: 'hotel', districtId: 'wuse', blurb: 'Conferences, receptions and a lobby where deals get done.' }),
  v({ id: 'chelsea-hotel-abuja', name: 'Chelsea Hotel Abuja', type: 'hotel', districtId: 'wuse', blurb: 'A dependable mid-range hotel off Wuse: a clean room, a bar and proper pepper soup.' }),
  v({ id: 'healthplus-wuse', name: 'HealthPlus Pharmacy Wuse 2', type: 'pharmacy', districtId: 'wuse', blurb: 'Chain pharmacy on Aminu Kano Crescent: drugs, baby things and a cold-water dispenser.', hours: [8, 22] }),
  v({ id: 'wuse-fitness', name: 'Wuse 2 Fitness Centre', type: 'gym', districtId: 'wuse', blurb: 'Treadmills, free weights and civil servants at six a.m.', hours: [5, 22] }),
  v({ id: 'yahuza-suya', name: 'Yahuza Suya Spot', type: 'buka', districtId: 'wuse', blurb: 'Abuja’s famous suya: beef, ram and chicken with yaji and onions, a proper late supper.', hours: [16, 28] }),
  v({ id: 'wuse-salon', name: 'Zone 5 Unisex Salon', type: 'salon', districtId: 'wuse', blurb: 'Braids, barbing and gist on every chair.', hours: [8, 21] }),
  v({ id: 'wuse-police-division', name: 'Wuse Police Division', type: 'government', districtId: 'wuse', blurb: 'Statements, bail and “anything for the boys”.', hours: [0, 24] }),
  v({ id: 'gtbank-wuse', name: 'GTBank Wuse 2', type: 'office', districtId: 'wuse', blurb: 'The orange banking hall: tellers, queues and a very good app.', hours: [8, 17] }),
  v({ id: 'rhapsodys-abuja', name: 'Rhapsody’s Restaurant', type: 'restaurant', districtId: 'wuse', blurb: 'Abuja’s date-night dining: grills, pasta and a long cocktail list.', hours: [11, 24] }),
  v({ id: 'cue-bar', name: 'Cue Bar', type: 'bar', districtId: 'wuse', blurb: 'Cocktails and the match on every screen, inside Lobito Mall, Wuse 2.', hours: [12, 27] }),

  // Garki
  v({ id: 'garki-market', name: 'Garki International Market', type: 'market', districtId: 'garki', blurb: 'Rows of stalls from foodstuff to fabric: Garki’s old market and its loudest bargains.', hours: [7, 19] }),
  v({ id: 'garki-hospital', name: 'Garki Hospital', type: 'hospital-public', districtId: 'garki', blurb: 'Busy hospital on the Garki side: long queues, short tempers, good doctors.' }),
  v({ id: 'garki-central-mosque', name: 'Garki Central Mosque', type: 'mosque', districtId: 'garki', blurb: 'Five daily prayers and a full courtyard on Fridays.', hours: [4, 22] }),
  v({ id: 'jamb-cbt-garki', name: 'JAMB CBT Centre Garki', type: 'cbt-centre', districtId: 'garki', blurb: 'UTME registration and exam centre: biometrics, “network is slow” and nervous parents.', hours: [7, 18] }),
  v({ id: 'force-headquarters', name: 'Nigeria Police Force Headquarters', type: 'government', districtId: 'garki', blurb: 'Louis Edet House: the Inspector-General’s office and the Force’s files.', hours: [0, 24] }),
  v({ id: 'garki-pharmacy', name: 'Garki Area 11 Pharmacy', type: 'pharmacy', districtId: 'garki', blurb: 'Neighbourhood pharmacy: cough syrup, malaria tests and advice.', hours: [7, 22] }),
  v({ id: 'garki-gym', name: 'Area 3 Fitness Gym', type: 'gym', districtId: 'garki', blurb: 'No-frills iron and a punching bag, ₦15k a month.', hours: [5, 22] }),
  v({ id: 'garki-salon', name: 'Area 1 Hair & Beauty', type: 'salon', districtId: 'garki', blurb: 'Weave-ons, wash-and-set and the best gist in Garki.', hours: [8, 21] }),
  v({ id: 'garki-auto-mart', name: 'Garki Auto Mart', type: 'car-dealer', districtId: 'garki', blurb: 'Tokunbo Camrys and Hiaces on the old Garki road.', hours: [8, 18] }),
  v({ id: 'first-bank-garki', name: 'First Bank Garki', type: 'office', districtId: 'garki', blurb: 'The oldest bank in Nigeria, with a Garki queue to match.', hours: [8, 17] }),

  // Jabi / Utako
  v({ id: 'jabi-lake-park', name: 'Jabi Lake Park', type: 'park', districtId: 'jabi', blurb: 'Boat rides, picnic lawns and joggers around the lake.', hours: [7, 22] }),
  v({ id: 'baze-university', name: 'Baze University', type: 'campus', districtId: 'jabi', blurb: 'Private university in Jabi: small classes and a quiet campus.' }),
  v({ id: 'nile-university', name: 'Nile University of Nigeria', type: 'campus', districtId: 'jabi', blurb: 'Private university on the Airport Road side, in Jabi’s institutions area.' }),
  v({ id: 'brains-and-hammers', name: 'Brains & Hammers', type: 'estate-agency', districtId: 'jabi', blurb: 'Abuja property developer and agent: flats, duplexes and land with papers.', hours: [8, 18] }),
  v({ id: 'access-bank-utako', name: 'Access Bank Utako', type: 'office', districtId: 'jabi', blurb: 'Utako’s busy branch: transfers, loans and a very long queue at month end.', hours: [8, 17] }),
  v({ id: 'jabi-auto-gallery', name: 'Jabi Auto Gallery', type: 'car-dealer', districtId: 'jabi', blurb: 'Brand-new and clean tokunbo SUVs for Abuja’s big men.', hours: [9, 19] }),
  v({ id: 'jabi-lake-lounge', name: 'Jabi Lake Lounge', type: 'bar', districtId: 'jabi', blurb: 'Lakeside drinks, shisha and a breeze off the water.', hours: [14, 27] }),

  // Gwarinpa
  v({ id: 'gwarinpa-general-hospital', name: 'Gwarinpa General Hospital', type: 'hospital-public', districtId: 'gwarinpa', blurb: 'The estate’s general hospital: maternity, malaria and long Monday queues.' }),
  v({ id: 'rccg-gwarinpa', name: 'RCCG Gwarinpa', type: 'church', districtId: 'gwarinpa', blurb: 'Redeemed Christian Church of God parish: Sunday service and Holy Ghost night.', hours: [6, 22] }),
  v({ id: 'gwarinpa-central-mosque', name: 'Gwarinpa Estate Central Mosque', type: 'mosque', districtId: 'gwarinpa', blurb: 'The estate’s Jumu’ah mosque, with a loudspeaker for the 4 a.m. call.', hours: [4, 22] }),
  v({ id: 'gwarinpa-school', name: 'Gwarinpa Estate Model School', type: 'school', districtId: 'gwarinpa', blurb: 'Nursery, primary and secondary for the estate’s children.', hours: [7, 17] }),
  v({ id: 'gwarinpa-buka', name: '1st Avenue Buka', type: 'buka', districtId: 'gwarinpa', blurb: 'Jollof, ofada and pounded yam for the estate’s lunch crowd.', hours: [8, 21] }),

  // Kubwa
  v({ id: 'kubwa-market', name: 'Kubwa Market', type: 'market', districtId: 'kubwa', blurb: 'The satellite town’s market: cheap foodstuff, second-hand clothes and expressway noise.', hours: [7, 19] }),
  v({ id: 'kubwa-pharmacy', name: 'Phase 4 Pharmacy Kubwa', type: 'pharmacy', districtId: 'kubwa', blurb: 'The pharmacy on the expressway side: malaria tests, paracetamol and advice for free.', hours: [7, 22] }),
  v({ id: 'kubwa-general-hospital', name: 'Kubwa General Hospital', type: 'hospital-public', districtId: 'kubwa', blurb: 'Public hospital on the Kubwa Expressway: bring patience and a file.' }),

  // Lugbe / Airport Road
  v({ id: 'university-of-abuja', name: 'University of Abuja', type: 'campus', districtId: 'lugbe', blurb: 'The federal university along the Airport Road: Uniabuja’s lecture theatres and ASUU strikes.' }),
  v({ id: 'dunamis-glory-dome', name: 'Dunamis International Gospel Centre (Glory Dome)', type: 'church', districtId: 'lugbe', blurb: 'One of Africa’s largest church auditoriums, on the Airport Road.', hours: [6, 22] }),
  v({ id: 'lugbe-market', name: 'Lugbe Market', type: 'market', districtId: 'lugbe', blurb: 'Foodstuff and second-hand clothes for the Airport Road estates.', hours: [7, 19] }),

  // Asokoro
  v({ id: 'national-assembly', name: 'National Assembly Complex', type: 'government', districtId: 'asokoro', blurb: 'The Senate and the House of Representatives under the green dome: visitors in the gallery, lobbyists in the corridors.', hours: [8, 18] }),
  v({ id: 'abuja-club', name: 'Abuja Club', type: 'gym', districtId: 'asokoro', blurb: 'Members-only gym, golf course and handshakes that move ministries.', minStatus: 450, hours: [5, 23] }),
  v({ id: 'asokoro-district-hospital', name: 'Asokoro District Hospital', type: 'hospital-public', districtId: 'asokoro', blurb: 'The district hospital under Aso Rock: cleaner than most, still a queue.' }),

  // Hotels added after the first city shipped: last, so every earlier venue keeps the lot it was given.
  v({ id: 'federal-palace-hotel', name: 'Federal Palace Hotel', type: 'hotel', districtId: 'victoria-island', blurb: 'Ahmadu Bello Way’s grand old hotel: a pool, a ballroom and a bar with a view.' }),
  v({ id: 'lagos-continental-hotel', name: 'The Lagos Continental Hotel', type: 'hotel', districtId: 'victoria-island', blurb: 'A tall business hotel on the Island: meetings, a spa and a lagoon view.' }),
  v({ id: 'the-wheatbaker', name: 'The Wheatbaker', type: 'hotel', districtId: 'ikoyi', blurb: 'Ikoyi’s quiet boutique hotel: art on the walls, afternoon tea and a garden pool.' }),
  v({ id: 'radisson-blu-ikeja', name: 'Radisson Blu Anchorage Ikeja', type: 'hotel', districtId: 'ikeja', blurb: 'Ikeja’s business hotel: meetings by day, a pool and a bar by night.' }),
  v({ id: 'four-points-lekki', name: 'Four Points by Sheraton Lekki', type: 'hotel', districtId: 'lekki', blurb: 'Rooftop views and a breakfast spread on the Lekki side.' }),
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

/** The city a venue is in (from its district). */
export function cityOfVenue(venue: Pick<VenueDefinition, 'districtId'>): CityId {
  return DISTRICTS[venue.districtId].cityId;
}

/** City of a venue id, or null for an unknown id. */
export function cityOfVenueId(venueId: string): CityId | null {
  const venue = findVenue(venueId);
  return venue ? cityOfVenue(venue) : null;
}

/**
 * The city a location id is in. Venues and streets know theirs; a home (`home:<id>`) is wherever its owner lives, so
 * the caller passes the district of the home it means (your own: `character.homeDistrictId`). Null if it can't be told.
 */
export function cityOfLocation(locationId: string, homeDistrictId?: DistrictId | null): CityId | null {
  const street = streetDistrict(locationId);
  if (street) return DISTRICTS[street]?.cityId ?? null;
  if (isHomeLocation(locationId)) return homeDistrictId ? DISTRICTS[homeDistrictId].cityId : null;
  return cityOfVenueId(locationId);
}

/** Venues of a city. */
export function venuesOfCity(cityId: CityId): VenueDefinition[] {
  return VENUES.filter((venue) => cityOfVenue(venue) === cityId);
}
