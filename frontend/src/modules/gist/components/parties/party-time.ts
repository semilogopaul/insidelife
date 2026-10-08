import { formatClock12, formatDate, formatGameDuration, type GameMinute, type PartyDto } from '@insidelife/shared';

/** "Live — ends 11:00 PM", "Starts 8:00 PM (in 2h)", "Sat 14 Mar, 8:00 PM". */
export function partyWhen(party: PartyDto, now: GameMinute): string {
  if (party.phase === 'live') return `Live — ends ${formatClock12(party.endsAt)}`;
  if (party.phase === 'ended') return 'Ended';
  if (party.phase === 'cancelled') return 'Cancelled';
  const until = party.startsAt - now;
  if (until < 24 * 60) return `Starts ${formatClock12(party.startsAt)} (in ${formatGameDuration(until)})`;
  return `${formatDate(party.startsAt)}, ${formatClock12(party.startsAt)}`;
}
