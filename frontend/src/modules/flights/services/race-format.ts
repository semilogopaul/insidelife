import { formatGameDuration, formatRaceTime, getCity, type GameMinute, type RaceDto, type RaceRacerDto } from '@insidelife/shared';
import type { ChipTone } from './flights-format';

/** The Flights app's deep link to the Race tab: `race`, or `race:<character id>` to pre-pick that friend. */
export function raceDeepLink(param: string | null): { readonly open: boolean; readonly friendId: string | null } {
  if (param === 'race') return { open: true, friendId: null };
  if (param?.startsWith('race:')) return { open: true, friendId: param.slice('race:'.length) || null };
  return { open: false, friendId: null };
}

export const ordinalPlace = (place: number): string => (place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`);

/** "Lagos to Abuja". */
export const raceRoute = (race: Pick<RaceDto, 'fromCity' | 'toCity'>): string => `${getCity(race.fromCity).name} to ${getCity(race.toCity).name}`;

/** The status chip of a race card. */
export function raceChip(race: RaceDto, now: GameMinute): { readonly label: string; readonly tone: ChipTone } {
  switch (race.status) {
    case 'pending':
      return { label: 'Waiting for answers', tone: 'info' };
    case 'running':
      return now >= race.expiresAt ? { label: 'Time is up', tone: 'warn' } : race.decided ? { label: 'Winner known', tone: 'good' } : { label: 'Race on', tone: 'good' };
    case 'finished':
      return { label: 'Finished', tone: 'neutral' };
    case 'expired':
      return { label: 'Ended', tone: 'neutral' };
    case 'cancelled':
      return { label: 'Called off', tone: 'neutral' };
  }
}

/** How much time is left on a pending or running race, or null. */
export function raceClock(race: RaceDto, now: GameMinute): string | null {
  if (race.status !== 'pending' && race.status !== 'running') return null;
  const left = race.expiresAt - now;
  if (left <= 0) return race.status === 'pending' ? 'Lapsing' : 'Ending';
  return race.status === 'pending' ? `Lapses in ${formatGameDuration(left)}` : `Ends in ${formatGameDuration(left)}`;
}

/** The line under a racer's name: where they stand in the race. */
export function racerLine(race: RaceDto, racer: RaceRacerDto, now: GameMinute): string {
  if (racer.status === 'finished' && racer.place !== null) {
    const time = racer.elapsedMinutes !== null ? formatRaceTime(racer.elapsedMinutes) : '';
    return [ordinalPlace(racer.place), time, racer.howLabel].filter(Boolean).join(' · ');
  }
  if (racer.status === 'invited') return 'Deciding';
  if (race.status === 'pending') return 'In';
  if (race.status === 'running' && now < race.expiresAt) return 'On the way';
  return 'Did not finish';
}
