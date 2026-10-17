import {
  AIRCRAFT_NAME_MAX,
  GAT_NAMES,
  LIVERY_COLOURS,
  aircraftNameIssue,
  findLiveryColour,
  isGatId,
  normaliseRegistration,
  registrationIssue,
  type AircraftCatalogEntryDto,
  type AircraftClass,
  type GameMinute,
  type OwnedAircraftDto,
  type PilotTrainingDto,
} from '@insidelife/shared';
import type { ReceiptLine } from '@/common/components';

export type Airframe = 'piston' | 'twin' | 'turboprop' | 'jet' | 'airliner';

/** Which silhouette to draw for an aircraft class. */
export function airframeFor(aircraftClass: AircraftClass): Airframe {
  switch (aircraftClass) {
    case 'piston-single':
      return 'piston';
    case 'piston-twin':
      return 'twin';
    case 'turboprop':
      return 'turboprop';
    case 'airliner-jet':
      return 'airliner';
    default:
      return 'jet';
  }
}

/** "2h 38m" for a flight time in game minutes. */
export function formatFlightTime(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function gatName(id: string): string {
  return isGatId(id) ? GAT_NAMES[id] : id;
}

/** Colour hex for a livery id (falls back to white so a bad id never breaks the picture). */
export function liveryHex(id: string): string {
  return findLiveryColour(id)?.hex ?? '#f5f7fa';
}

export function liveryLabel(id: string): string {
  return findLiveryColour(id)?.label ?? id;
}

export const PALETTE = LIVERY_COLOURS;

/** "Tolu" typed into the registration box → "TOL" (letters only, three at most, upper-case). */
export function registrationDraft(input: string): string {
  return input
    .toUpperCase()
    .replace(/^5N-?/, '')
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
}

/** A problem with the draft registration, or null when it can be submitted. */
export function registrationProblem(draft: string): string | null {
  if (draft.length === 0) return null;
  if (draft.length < 3) return 'Three letters, like TOL';
  return registrationIssue(draft);
}

export function registrationFull(draft: string): string | null {
  return normaliseRegistration(draft);
}

/** A problem with the draft name, or null (empty is fine: no name painted). */
export function nameProblem(draft: string): string | null {
  if (draft.trim() === '') return null;
  return aircraftNameIssue(draft);
}

export const NAME_MAX = AIRCRAFT_NAME_MAX;

/** The receipt for buying: price, plus the ferry flight when you are not at the sales desk. */
export function purchaseLines(entry: AircraftCatalogEntryDto, inPerson: boolean, deliveryTo: string): readonly ReceiptLine[] {
  const lines: ReceiptLine[] = [{ label: entry.aircraft.name, amount: entry.price }];
  if (!inPerson) lines.push({ label: 'Ferry flight', amount: entry.ferryFee, note: `Delivered to ${gatName(deliveryTo)} in 3 days` });
  return lines;
}

export function purchaseTotal(entry: AircraftCatalogEntryDto, inPerson: boolean): number {
  return entry.price + (inPerson ? 0 : entry.ferryFee);
}

export type TrainingStep = 'licensed' | 'enrol' | 'lesson' | 'wait' | 'check-ride' | 'busy';

/** The one thing to do next on the licence tab. */
export function nextTrainingStep(training: PilotTrainingDto, now: GameMinute): TrainingStep {
  if (training.licence) return 'licensed';
  if (training.inProgress) return 'busy';
  if (!training.enrolled) return 'enrol';
  if (training.lessons >= training.lessonsRequired) return 'check-ride';
  if (training.nextLessonAt !== null && training.nextLessonAt > now) return 'wait';
  return 'lesson';
}

export function lessonProgress(training: PilotTrainingDto): number {
  return training.lessonsRequired > 0 ? Math.min(1, training.lessons / training.lessonsRequired) : 0;
}

/** Fleet sorted: ones you can fly right now first, then by value. */
export function sortFleet(fleet: readonly OwnedAircraftDto[]): readonly OwnedAircraftDto[] {
  return fleet.toSorted((a, b) => Number(a.flyBlocker !== null) - Number(b.flyBlocker !== null) || b.value - a.value);
}
