import { REGISTRATION_PREFIX, aircraftNeedsLicence, registrationIssue, type AircraftDefinition, type GameMinute, type Rng } from '@insidelife/shared';

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
  if (check.locationId !== check.parkedAt) return 'Your aircraft is parked at another terminal. Go there to fly it';
  if (aircraftNeedsLicence(check.aircraft) && !check.licenceHeld) return 'You need a Private Pilot Licence to fly this one yourself';
  return null;
}
