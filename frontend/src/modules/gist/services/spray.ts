import { NAIRA_ABUSE, SPRAY_RULES, checkSprayAmount, formatNaira, type SprayAmountCheck } from '@insidelife/shared';

/** A bundle of notes in hand: how many ₦1,000 and ₦500 notes. */
export interface NoteBundle {
  readonly thousands: number;
  readonly fiveHundreds: number;
}

export const EMPTY_BUNDLE: NoteBundle = { thousands: 0, fiveHundreds: 0 };

/** Quick bundles: a wad of ₦1,000 notes ("one bundle" in owambe-speak is 100 notes). */
export const SPRAY_PRESETS: readonly number[] = [5_000, 20_000, 50_000, 100_000];

export function bundleAmount(bundle: NoteBundle): number {
  return bundle.thousands * 1_000 + bundle.fiveHundreds * 500;
}

/** Add notes, never going below zero; ₦500 notes fold into ₦1,000s in pairs. */
export function addNotes(bundle: NoteBundle, note: 1_000 | 500, count: number): NoteBundle {
  if (note === 1_000) return { ...bundle, thousands: Math.max(0, bundle.thousands + count) };
  const halves = Math.max(0, bundle.fiveHundreds + count);
  return { thousands: bundle.thousands + Math.floor(halves / 2), fiveHundreds: halves % 2 };
}

/** The notes for an amount: as many ₦1,000s as possible, then one ₦500. Amounts are rounded down to whole notes. */
export function bundleFor(amount: number): NoteBundle {
  const whole = Math.max(0, Math.floor(amount / 500) * 500);
  const thousands = Math.floor(whole / 1_000);
  return { thousands, fiveHundreds: (whole - thousands * 1_000) / 500 };
}

export type SprayValidation = SprayAmountCheck | { readonly ok: false; readonly code: 'NO_CASH' | 'PARTY_CAP'; readonly message: string };

/** Client preview of the server rules: whole notes, per-spray cap, per-party cap and cash in hand. */
export function validateSpray(amount: number, cash: number, partyTotal: number): SprayValidation {
  const base = checkSprayAmount(amount);
  if (!base.ok) return base;
  if (amount > cash) return { ok: false, code: 'NO_CASH', message: `You only have ${formatNaira(cash)} in cash` };
  if (partyTotal + amount > SPRAY_RULES.maxPerParty) {
    return { ok: false, code: 'PARTY_CAP', message: `Max ${formatNaira(SPRAY_RULES.maxPerParty)} per guest per party — you’ve sprayed ${formatNaira(partyTotal)}` };
  }
  return { ok: true };
}

/** EFCC warning when this spray takes your party total past a ₦500k naira-abuse threshold. */
export function efccWarning(partyTotal: number, amount: number): string | null {
  const after = partyTotal + amount;
  if (after <= NAIRA_ABUSE.threshold) return null;
  const crossing = Math.floor(after / NAIRA_ABUSE.threshold) > Math.floor(partyTotal / NAIRA_ABUSE.threshold);
  return crossing
    ? `Spraying naira is illegal under the CBN Act. Past ${formatNaira(NAIRA_ABUSE.threshold)} at one party, EFCC fit carry you — each ₦500k you cross risks a fine.`
    : `You’re past ${formatNaira(NAIRA_ABUSE.threshold)} at this party. EFCC is watching the next ₦500k.`;
}
