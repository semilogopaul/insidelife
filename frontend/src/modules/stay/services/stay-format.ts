import { HOTEL_PURPOSE, MINUTES_PER_DAY, formatClock12, hasHomeInCity, startOfDay, type CityId, type DistrictId, type GameMinute } from '@insidelife/shared';

/** "today at 12:00 PM", "tomorrow at 12:00 PM", "in 3 days at 12:00 PM": when a room is given up, seen from `now`. */
export function checkoutLabel(checkoutAt: GameMinute, now: GameMinute): string {
  const days = Math.round((startOfDay(checkoutAt) - startOfDay(now)) / MINUTES_PER_DAY);
  const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  return `${when} at ${formatClock12(checkoutAt)}`;
}

/** The bill for a booking (the server decides; this is the preview on the button). */
export function stayTotal(nightlyRate: number, nights: number): number {
  return nightlyRate * nights;
}

/** "1 night", "3 nights". */
export function nightsLabel(nights: number): string {
  return `${nights} night${nights === 1 ? '' : 's'}`;
}

/**
 * What the Stay app and the reception say about why hotels exist: they are for when you have no home in this city. With
 * a home here the note says so and booking is still allowed.
 */
export function lodgingNote(homeDistrictId: DistrictId, homeLabel: string, cityId: CityId, cityName: string): { readonly hasHome: boolean; readonly text: string } {
  const hasHome = hasHomeInCity(homeDistrictId, cityId);
  return hasHome
    ? { hasHome, text: `You have a home in ${cityName} (${homeLabel}). ${HOTEL_PURPOSE} You can still book a room if you want one.` }
    : { hasHome, text: `You have no home in ${cityName}, so a hotel room is your bed here. ${HOTEL_PURPOSE}` };
}
