import { formatNaira, koboToNaira, type ClubSongOfferDto } from '@insidelife/shared';

/**
 * The value of a club song booking in words, before purchase: plays a day (and the floor), clubs, the daily price and
 * what one play works out at. "≈ 120 plays a day across 12 clubs and lounges (never under 119). ₦35,000 a week =
 * ₦5,000 a day, about ₦42 a play."
 */
export function songGuaranteeLine(offer: Pick<ClubSongOfferDto, 'playsPerDay' | 'minPlaysPerDay' | 'clubs' | 'weekPriceKobo'>, durationSeconds?: number): string {
  const day = koboToNaira(offer.weekPriceKobo) / 7;
  const perPlay = offer.playsPerDay > 0 ? Math.round(day / offer.playsPerDay) : null;
  const length = durationSeconds ? ` Each play is the whole song${durationSeconds >= 60 ? ` (${Math.floor(durationSeconds / 60)}:${String(Math.round(durationSeconds % 60)).padStart(2, '0')})` : ''}.` : '';
  return (
    `≈ ${offer.playsPerDay.toLocaleString('en-NG')} plays a day across ${offer.clubs} clubs and lounges (never under ${offer.minPlaysPerDay.toLocaleString('en-NG')}). ` +
    `${formatNaira(koboToNaira(offer.weekPriceKobo))} a week = ${formatNaira(Math.round(day))} a day${perPlay !== null ? `, about ${formatNaira(perPlay)} a play` : ''}.${length}`
  );
}

/** "Heard by 37 players across 12 plays" (or the honest zero case). */
export function audienceLine(plays: number, listeners: number): string {
  if (plays === 0) return 'No plays yet.';
  const p = (count: number, one: string, many: string): string => `${count.toLocaleString('en-NG')} ${count === 1 ? one : many}`;
  if (listeners === 0) return `Played ${p(plays, 'time', 'times')}; no players were in the club yet when it played.`;
  return `Heard by ${p(listeners, 'player', 'players')} across ${p(plays, 'play', 'plays')}.`;
}
