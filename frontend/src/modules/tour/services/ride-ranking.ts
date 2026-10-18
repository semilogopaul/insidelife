import { TRANSPORT, modesInCity, trafficMultiplier, type CityId, type TransportMode } from '@insidelife/shared';

/** Modes you can book or drive from the Map in a city (walking is the GPS option, not a ride). */
const rideModes = (cityId: CityId): readonly TransportMode[] => modesInCity(cityId).filter((mode) => mode !== 'walk');

export type TrafficLevel = 'normal' | 'rush';

/** A weekday midday and a weekday morning rush, both dry: the go-slow the world model really applies. */
const MULTIPLIER: Readonly<Record<TrafficLevel, number>> = {
  normal: trafficMultiplier(12, false, false),
  rush: trafficMultiplier(8, false, false),
};

export interface RankedRide {
  readonly mode: TransportMode;
  readonly label: string;
  /** Map units per game hour after go-slow (same formula as `quoteTrip`). */
  readonly speed: number;
}

/** Rides ordered fastest first at the given traffic, from each mode's `speed` and `trafficExposure`. */
export function rankRides(level: TrafficLevel, cityId: CityId = 'lagos'): readonly RankedRide[] {
  return rideModes(cityId).map((mode) => {
    const def = TRANSPORT[mode];
    const traffic = 1 + (MULTIPLIER[level] - 1) * def.trafficExposure;
    return { mode, label: def.label, speed: def.speed / traffic };
  }).sort((a, b) => b.speed - a.speed);
}

const names = (rides: readonly RankedRide[]): string => rides.map((ride) => ride.label).join(', ');

/** Copy for the "Book a ride" step, written from the ranking so it can never drift from the data. */
export function rideAdvice(cityId: CityId = 'lagos'): string {
  if (cityId === 'abuja') return abujaRideAdvice();
  const normal = rankRides('normal');
  const rush = rankRides('rush');
  const fastest = rush[0]!;
  const slowest = rush[rush.length - 1]!;
  const rushPlace = (mode: TransportMode): number => rush.findIndex((ride) => ride.mode === mode);
  const brtBeatsBolt = rushPlace('brt') < rushPlace('bolt');
  const banned = rideModes('lagos').filter((mode) => TRANSPORT[mode].bannedAcrossLagoon).map((mode) => TRANSPORT[mode].label);
  return [
    `Ride speed depends on traffic. ${fastest.label} is fastest${normal[0]!.mode === fastest.mode ? ' in any traffic' : ''}, but ${banned.join(' and ')} can’t use the bridges. ${slowest.label} is the slowest and cheap, stuck in every go-slow.`,
    brtBeatsBolt ? `Bolt is quick door to door, yet at rush hour the ${TRANSPORT.brt.label}’s own lane beats it, and costs far less.` : '',
    `Rush-hour order: ${names(rush)}. Your own car runs about as fast as Bolt and burns fuel.`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Abuja has no danfo or okada in town: green cabs, Bolt and the city bus, with keke only out in the satellite towns. */
function abujaRideAdvice(): string {
  const rush = rankRides('rush', 'abuja');
  const city = rush.filter((ride) => ride.mode !== 'keke' && ride.mode !== 'okada');
  return [
    `Abuja runs on ${names(city)}. ${rush[0]!.label} is fastest in rush hour.`,
    `${TRANSPORT.keke.label} and ${TRANSPORT.okada.label} are banned in the city centre and only run between Gwarinpa, Kubwa and Lugbe.`,
    `Rush-hour order: ${names(rush)}.`,
  ].join(' ');
}
