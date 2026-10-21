import {
  CITIES,
  GAT_NAMES,
  REGISTRATION_PREFIX,
  aircraftLocationId,
  aircraftNeedsLicence,
  findVenue,
  isGatId,
  registrationIssue,
  type AircraftDefinition,
  type GameMinute,
  type Rng,
} from '@insidelife/shared';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Three random letters as a `5N-XXX` registration the registry would issue (never a blocked one). */
export function randomRegistration(rng: Rng): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const letters = Array.from({ length: 3 }, () => LETTERS[rng.int(0, LETTERS.length - 1)]).join('');
    const registration = `${REGISTRATION_PREFIX}${letters}`;
    if (registrationIssue(registration) === null) return registration;
  }
  return `${REGISTRATION_PREFIX}NGA`;
}

export interface FlyCheck {
  /** The aircraft's id: standing aboard it (`aircraft:<id>`) counts as being at its terminal. */
  readonly aircraftId?: string;
  readonly aircraft: Pick<AircraftDefinition, 'class'>;
  readonly parkedAt: string;
  readonly arrivesAt: GameMinute | null;
  readonly grounded: boolean;
  readonly now: GameMinute;
  /** Where the character stands (a venue id), and whether they are mid-trip. */
  readonly locationId: string;
  readonly travelling: boolean;
  readonly licenceHeld: boolean;
}

/** Why the owner can't take the aircraft up right now (player-facing), or null when they can. */
export function flyBlocker(check: FlyCheck): string | null {
  if (check.arrivesAt !== null && check.arrivesAt > check.now) return 'Your aircraft is still in the air or on its ferry flight';
  if (check.grounded) return 'Grounded for unpaid hangar, crew or maintenance bills. Settle them first';
  if (check.travelling) return 'You’re on the move. Get to the terminal first';
  const aboard = check.aircraftId !== undefined && check.locationId === aircraftLocationId(check.aircraftId);
  if (check.locationId !== check.parkedAt && !aboard) return goToTerminal(check.parkedAt, check.locationId, 'fly');
  if (aircraftNeedsLicence(check.aircraft) && !check.licenceHeld) return 'You need a Private Pilot Licence to fly this one yourself';
  return null;
}

export interface BoardCheck {
  readonly aircraftId: string;
  readonly parkedAt: string;
  readonly arrivesAt: GameMinute | null;
  readonly now: GameMinute;
  readonly locationId: string;
  readonly travelling: boolean;
}

/** Why the owner can't step aboard their aircraft right now (player-facing), or null when they can. */
export function boardBlocker(check: BoardCheck): string | null {
  if (check.arrivesAt !== null && check.arrivesAt > check.now) return 'Your aircraft is still in the air or on its ferry flight';
  if (check.travelling) return 'You’re on the move. Get to the terminal first';
  if (check.locationId !== check.parkedAt && check.locationId !== aircraftLocationId(check.aircraftId)) return goToTerminal(check.parkedAt, check.locationId, 'board');
  return null;
}

/**
 * Where to send an owner who isn't inside the aircraft's terminal (player-facing). Names the terminal, and calls out the
 * commercial airport next door: the two stand side by side, so it is the easy door to walk into by mistake.
 */
function goToTerminal(parkedAt: string, locationId: string, verb: 'fly' | 'board'): string {
  const terminal = isGatId(parkedAt) ? `the ${GAT_NAMES[parkedAt]}` : 'its terminal';
  const here = findVenue(locationId);
  const nextDoor = here?.type === 'airport' && Object.values(CITIES).some((city) => city.airportVenueId === here.id && city.gatVenueId === parkedAt);
  if (here && nextDoor) return `You’re in ${here.name}. Your aircraft is at ${terminal} next door: go in there to ${verb} it`;
  return `Your aircraft is parked at ${terminal}. Go inside that terminal to ${verb} it`;
}
