import { AIRPORT, BEACH, CAR_DEALER, MALL, MARKET, MOTOR_PARK, PARK } from './catalog/commerce-outdoor';
import { CHURCH, CINEMA, CLINIC, GYM, HOSPITAL_WARD, MOSQUE, PHARMACY } from './catalog/health-faith';
import { HOME_DUPLEX, HOME_FACE_ME, HOME_FAMILY, HOME_FLAT, HOME_HOSTEL, HOME_MANSION, HOME_SELF_CONTAIN } from './catalog/homes';
import { KIT_TEST } from './catalog/kit-test';
import { CAMPUS, CBT_CENTRE, ESTATE_AGENCY, GOVERNMENT, OFFICE, SCHOOL } from './catalog/learning-work';
import { BAR, BUKA, CLUB, EVENT_CENTRE, RESTAURANT, SALON } from './catalog/social';
import { JET_CABIN, MANSION_PARLOUR, REFINERY_CENTRE } from './catalog/showcase';
import type { InteriorTemplateId } from './resolve';
import type { InteriorTemplate } from './types';

export const TEMPLATES: Readonly<Record<InteriorTemplateId, InteriorTemplate>> = {
  'home-family': HOME_FAMILY,
  'home-face-me': HOME_FACE_ME,
  'home-self-contain': HOME_SELF_CONTAIN,
  'home-flat': HOME_FLAT,
  'home-duplex': HOME_DUPLEX,
  'home-mansion': HOME_MANSION,
  'home-hostel': HOME_HOSTEL,
  campus: CAMPUS,
  school: SCHOOL,
  office: OFFICE,
  'hospital-ward': HOSPITAL_WARD,
  clinic: CLINIC,
  pharmacy: PHARMACY,
  club: CLUB,
  buka: BUKA,
  restaurant: RESTAURANT,
  bar: BAR,
  market: MARKET,
  mall: MALL,
  gym: GYM,
  cinema: CINEMA,
  church: CHURCH,
  mosque: MOSQUE,
  'cbt-centre': CBT_CENTRE,
  government: GOVERNMENT,
  'estate-agency': ESTATE_AGENCY,
  'car-dealer': CAR_DEALER,
  salon: SALON,
  airport: AIRPORT,
  'event-centre': EVENT_CENTRE,
  beach: BEACH,
  park: PARK,
  'motor-park': MOTOR_PARK,
  mansion: MANSION_PARLOUR,
  'private-jet': JET_CABIN,
  refinery: REFINERY_CENTRE,
};

/** Template by id (`kit-test` is a dev-only orientation check). */
export function getTemplate(id: InteriorTemplateId | 'kit-test'): InteriorTemplate {
  if (id === 'kit-test') return KIT_TEST;
  return TEMPLATES[id] ?? HOME_FAMILY;
}
