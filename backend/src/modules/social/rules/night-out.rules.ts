import { NIGHT_OUT_RULES, formatNaira, nightOutSoldAt, type NightOutItemDefinition, type NightOutItemId, type VenueType } from '@insidelife/shared';
import { containsProfanity } from '../../../common/moderation/profanity.js';
import { sanitisePlayerText } from '../text-sanitiser.js';
import { OK, fail, type RuleResult } from './rule-result.js';

/** Why the whole Night out panel is shut (or OK). */
export interface NightOutVenueInput {
  /** The place is a club, bar or event centre. */
  readonly nightlife: boolean;
  readonly senderHere: boolean;
  readonly open: boolean;
  readonly senderAge: number;
}

export function checkNightOutVenue(input: NightOutVenueInput): RuleResult {
  if (!input.nightlife) return fail('NO_NIGHT_OUT_HERE', 'Bottles and shoutouts are for clubs, bars and event centres');
  if (!input.senderHere) return fail('NOT_HERE', 'You have to be inside first');
  if (!input.open) return fail('CLOSED', 'The place is closed — the DJ has gone home');
  if (input.senderAge < NIGHT_OUT_RULES.minAge) return fail('UNDER_AGE', 'Clubs and bars are 18+. Your time go reach.');
  return OK;
}

export interface NightOutOfferInput extends NightOutVenueInput {
  readonly item: NightOutItemDefinition;
  readonly venueType: VenueType;
  /** This item, bought by you at this place tonight. */
  readonly boughtHereTonight: number;
  /** Every paid moment you bought tonight, anywhere in Lagos. */
  readonly momentsTonight: number;
  /** Handle of whoever holds the VIP section here tonight. */
  readonly vipHolder: string | null;
  /** Shoutouts waiting their turn here (not yet on screen), and how many of them are yours. */
  readonly shoutoutsWaiting: number;
  readonly yoursWaiting: number;
  readonly price: number;
  readonly senderCash: number;
}

/** Can you buy this item here right now (before picking who it's for)? Pure. */
export function checkNightOutOffer(input: NightOutOfferInput): RuleResult {
  const venue = checkNightOutVenue(input);
  if (!venue.ok) return venue;
  const { item } = input;
  if (!nightOutSoldAt(item, input.venueType)) return fail('NOT_SOLD_HERE', `${item.label} is a club thing — this place doesn’t do it`);
  if (input.boughtHereTonight >= item.perNight) {
    return fail('NIGHT_LIMIT', item.perNight === 1 ? `Once a night for ${item.label.toLowerCase()} — come back tomorrow` : `That’s ${item.perNight} tonight already. Save some for tomorrow.`);
  }
  if (input.momentsTonight >= NIGHT_OUT_RULES.maxMomentsPerNight) return fail('NIGHT_OUT_LIMIT', 'Odogwu, that’s enough for one night. Rest your wallet till morning.');
  if (item.kind === 'vip-section' && input.vipHolder !== null) return fail('VIP_TAKEN', `@${input.vipHolder} has the VIP section tonight`);
  if (item.kind === 'shoutout') {
    if (input.yoursWaiting >= NIGHT_OUT_RULES.maxQueuedPerPerson) return fail('SHOUTOUT_QUEUED', 'Your shoutout is still waiting its turn');
    if (input.shoutoutsWaiting >= NIGHT_OUT_RULES.maxQueuedShoutouts) return fail('QUEUE_FULL', 'The DJ’s list is full — try again in a minute');
  }
  if (input.senderCash < input.price) return fail('INSUFFICIENT_FUNDS', `You need ${formatNaira(input.price)} cash on you`);
  return OK;
}

export interface NightOutRecipient {
  readonly id: string;
  readonly age: number;
  readonly here: boolean;
  readonly blocked: boolean;
  /** Bottles you already sent them tonight. */
  readonly bottlesFromYouTonight: number;
}

/** Who it's for: someone 18+ in the room, not blocked, not spammed with bottles. Pure. */
export function checkNightOutTarget(item: NightOutItemDefinition, senderId: string, recipient: NightOutRecipient | null): RuleResult {
  if (item.target === 'none') return OK;
  if (!recipient) return item.target === 'required' ? fail('TARGET_REQUIRED', 'Pick who it’s for') : OK;
  if (recipient.id === senderId) return item.target === 'required' ? fail('SELF_GIFT', 'Sending yourself a bottle? Order one from the venue menu') : OK;
  if (!recipient.here) return fail('RECIPIENT_NOT_HERE', 'They’re not here right now');
  if (recipient.blocked) return fail('NIGHT_OUT_UNAVAILABLE', 'You can’t send this to that player');
  if (recipient.age < NIGHT_OUT_RULES.minAge) return fail('RECIPIENT_UNDER_AGE', item.kind === 'bottle' ? 'They’re under 18 — no bottles for them' : 'They’re under 18 — this one is for adults');
  if (item.kind === 'bottle' && recipient.bottlesFromYouTonight >= NIGHT_OUT_RULES.maxBottlesPerRecipient) {
    return fail('RECIPIENT_LIMIT', `${NIGHT_OUT_RULES.maxBottlesPerRecipient} bottles to one person is plenty for one night`);
  }
  return OK;
}

export type ShoutoutMessageCheck =
  | { readonly ok: true; readonly message: string; readonly mentions: readonly string[] }
  | { readonly ok: false; readonly code: string; readonly message: string };

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|ng|net|org|io|co|xyz|link|me|app|gg|ly|tv|info|biz|shop|site|online)\b)/i;
/** Ten or more digits, spaced or not ("0803 123 4567", "+2348031234567"): phone numbers and account numbers. */
const PHONE = /(?:\+?\d[\s.-]?){10,}/;
const MENTION = /@([a-z0-9_]{3,20})\b/gi;

/**
 * A shoutout message shown in bold to the whole room: up to 60 characters, cleaned like party titles, and refused
 * (not masked) when it carries a link, a phone number, a bad word or too many @mentions. Empty is fine (the DJ has
 * lines). Pure: the service still checks that mentioned players haven't blocked or been blocked by the buyer.
 */
export function checkShoutoutMessage(raw: string | null | undefined): ShoutoutMessageCheck {
  const max = NIGHT_OUT_RULES.shoutoutMaxLength;
  const trimmed = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (trimmed.length > max) return { ok: false, code: 'SHOUTOUT_TOO_LONG', message: `Keep it under ${max} characters — the DJ talks fast` };
  const message = sanitisePlayerText(trimmed, max);
  if (LINK.test(message)) return { ok: false, code: 'SHOUTOUT_LINK', message: 'No links on the DJ’s mic' };
  if (PHONE.test(message)) return { ok: false, code: 'SHOUTOUT_PHONE', message: 'No phone numbers on the DJ’s mic' };
  if (containsProfanity(message)) return { ok: false, code: 'SHOUTOUT_NOT_CLEAN', message: 'The DJ won’t say that on the mic. Keep it clean.' };
  const mentions = [...new Set([...message.matchAll(MENTION)].map((match) => match[1]!.toLowerCase()))];
  if (mentions.length > NIGHT_OUT_RULES.shoutoutMaxMentions) {
    return { ok: false, code: 'SHOUTOUT_MENTIONS', message: `Shout out at most ${NIGHT_OUT_RULES.shoutoutMaxMentions} people at a time` };
  }
  return { ok: true, message, mentions };
}

/** What the DJ says when you leave the message empty. */
export const DJ_LINES = ['is in the building!', 'has landed — make some noise!', 'is spending money tonight!', 'big energy only!', 'na you be the main character tonight!'] as const;

const BOTTLE_PHRASES: Readonly<Partial<Record<NightOutItemId, string>>> = {
  'premium-vodka': 'a bottle of premium vodka',
  champagne: 'a bottle of champagne',
  cognac: 'a bottle of aged cognac',
  'bottle-parade': 'a bottle parade with sparklers',
};

/** "a bottle of champagne", for notifications and banners. */
export function bottlePhrase(itemId: NightOutItemId): string {
  return BOTTLE_PHRASES[itemId] ?? 'a bottle';
}

export interface MomentLineInput {
  readonly item: NightOutItemDefinition;
  readonly from: string;
  readonly to: string | null;
  readonly message: string | null;
}

/** The system line in venue chat for a paid moment. Pure. */
export function momentChatLine({ item, from, to, message }: MomentLineInput): string {
  switch (item.kind) {
    case 'shoutout':
      return `${item.emoji} DJ: Shout out to @${from}${message ? ` — “${message}”` : '!'}`;
    case 'bottle':
      return `${item.emoji} @${from} sent @${to ?? 'someone'} ${bottlePhrase(item.id)}`;
    case 'birthday':
      return to ? `${item.emoji} Happy birthday @${to}! From @${from} — the whole room is singing` : `${item.emoji} It’s @${from}’s birthday! The whole room is singing`;
    case 'champagne-shower':
      return `${item.emoji} @${from} just showered the dance floor in champagne`;
    case 'confetti-cannon':
      return `${item.emoji} @${from} fired the confetti cannons`;
    case 'vip-section':
      return `${item.emoji} The VIP section is reserved for @${from} tonight`;
    case 'tip':
      return `${item.emoji} @${from} ${item.id === 'tip-dj' ? 'tipped the DJ' : 'tipped the bartender'}`;
  }
}
