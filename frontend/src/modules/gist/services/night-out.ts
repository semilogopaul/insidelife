import { NIGHT_OUT_RULES, formatNaira, type NightOutOfferDto } from '@insidelife/shared';

/** Someone in the room a bottle or a birthday can be for. */
export interface NightOutPerson {
  readonly handle: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly isFriend?: boolean;
}

/** Why the buy button is off (null: it's on). The server checks everything again. */
export function buyBlocker(offer: NightOutOfferDto | null, cash: number, target: NightOutPerson | null, closedReason: string | null): string | null {
  if (closedReason) return closedReason;
  if (!offer) return 'Pick something from the menu';
  if (offer.unavailable) return offer.unavailable;
  if (offer.target === 'required' && !target) return 'Pick who it’s for';
  if (cash < offer.price) return `You need ${formatNaira(offer.price)} cash on you — you have ${formatNaira(cash)}`;
  return null;
}

/** "Send Champagne to Femi · ₦353,100", "Shout out · ₦50,000", "Book Confetti cannon · ₦300,000". */
export function buyLabel(offer: NightOutOfferDto, target: NightOutPerson | null): string {
  const price = formatNaira(offer.price);
  if (offer.kind === 'bottle') return target ? `Send ${offer.label} to ${target.firstName} · ${price}` : `Send ${offer.label} · ${price}`;
  if (offer.kind === 'shoutout') return `Shout out · ${price}`;
  if (offer.kind === 'tip') return `${offer.label} · ${price}`;
  if (offer.kind === 'birthday') return target ? `Birthday for ${target.firstName} · ${price}` : `My birthday · ${price}`;
  return `Book ${offer.label.toLowerCase()} · ${price}`;
}

/** "8 s on screen", "Until closing". */
export function durationLabel(offer: Pick<NightOutOfferDto, 'durationMs' | 'kind'>): string {
  if (offer.kind === 'vip-section') return 'Until closing';
  return `${Math.round(offer.durationMs / 1_000)} s`;
}

export type QueueState = { readonly state: 'waiting' | 'live' | 'done'; readonly text: string };

/** Your shoutout's place in the DJ's queue: "You're next: in ~40s", "On screen now", "Your shoutout played". */
export function queueStatus(startsAt: number, durationMs: number, now: number): QueueState {
  if (now >= startsAt + durationMs) return { state: 'done', text: 'Your shoutout played. The room saw it.' };
  if (now >= startsAt) return { state: 'live', text: 'On screen now 🎤' };
  const seconds = Math.ceil((startsAt - now) / 1_000);
  if (seconds <= 2) return { state: 'waiting', text: 'You’re next: any second now' };
  const rounded = seconds < 10 ? seconds : Math.round(seconds / 5) * 5;
  return { state: 'waiting', text: `You’re next: in ~${rounded}s` };
}

/** Characters left in a shoutout message. */
export const shoutoutCharsLeft = (message: string): number => NIGHT_OUT_RULES.shoutoutMaxLength - message.length;
