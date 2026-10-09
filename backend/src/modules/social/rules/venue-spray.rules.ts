import { SPRAY_RULES, checkSprayAmount, formatNaira } from '@insidelife/shared';
import { OK, fail, type RuleResult } from './rule-result.js';

export interface VenueSprayCheckInput {
  readonly amount: number;
  readonly senderId: string;
  /** Null: the DJ. */
  readonly recipientId: string | null;
  /** The venue takes sprays (club, bar, event centre) and is open. */
  readonly sprayable: boolean;
  readonly open: boolean;
  readonly senderHere: boolean;
  readonly recipientHere: boolean;
  readonly blocked: boolean;
  /** Everything the sender sprayed here tonight. */
  readonly nightTotal: number;
  readonly senderCash: number;
}

/** Spraying in a club or bar. Pure. */
export function checkVenueSpray(input: VenueSprayCheckInput): RuleResult {
  const amount = checkSprayAmount(input.amount);
  if (!amount.ok) return fail(amount.code === 'NOT_WHOLE_NOTES' ? 'NOT_WHOLE_NOTES' : 'INVALID_AMOUNT', amount.message);
  if (!input.sprayable) return fail('NO_SPRAYING_HERE', 'Spraying is for clubs, bars and event centres');
  if (!input.senderHere) return fail('NOT_HERE', 'You have to be inside to spray');
  if (!input.open) return fail('CLOSED', 'The place is closed — the DJ has gone home');
  if (input.recipientId !== null) {
    if (input.recipientId === input.senderId) return fail('SPRAY_SELF', 'Spraying yourself is just counting money in public');
    if (!input.recipientHere) return fail('RECIPIENT_NOT_HERE', 'They’re not here right now');
    if (input.blocked) return fail('SPRAY_UNAVAILABLE', 'You can’t spray this player');
  }
  if (input.nightTotal + input.amount > SPRAY_RULES.maxPerParty) {
    const left = Math.max(0, SPRAY_RULES.maxPerParty - input.nightTotal);
    return fail('SPRAY_LIMIT', `Odogwu, calm down — you can spray ${formatNaira(left)} more here tonight`);
  }
  if (input.senderCash < input.amount) return fail('INSUFFICIENT_FUNDS', `You don’t have ${formatNaira(input.amount)} cash on you`);
  return OK;
}
