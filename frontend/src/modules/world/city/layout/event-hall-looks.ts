import type { BuildingRef } from './styles';

/**
 * How each event centre looks from the road (the `event-hall` lot archetype): its own building, paint and height, so
 * the Landmark Event Centre, the Civic Centre and the ICC do not read as one hall three times. Pure data.
 */
export interface EventHallLook {
  readonly ref: BuildingRef;
  readonly tint: number;
  readonly stretch: number;
}

export const EVENT_HALL_LOOKS: Readonly<Record<string, EventHallLook>> = {
  // Oniru's glass-fronted hall, painted for the owambe.
  'landmark-event-centre': { ref: 'c:building-n', tint: 0xf2dfc4, stretch: 1.25 },
  // The Civic Centre's tall green-and-white hall on Ozumba Mbadiwe.
  'lagos-civic-centre': { ref: 'c:building-j', tint: 0xe3eadb, stretch: 1.45 },
  // Abuja's conference centre: pale stone, a bank-sized block on its one-cell plot.
  'icc-abuja': { ref: 'c:building-i', tint: 0xeee6d3, stretch: 1.5 },
};
