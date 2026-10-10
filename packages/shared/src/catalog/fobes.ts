/**
 * Fobes — the Lagos Rich List (a phone app; a parody of the famous rich lists). Owned by the social domain, next to the
 * leaderboards. Pure and dependency-free: the server ranks and decides what each viewer may see; the client renders.
 */

export const FOBES_LIST_IDS = ['rich-list', 'self-made', 'under-30', 'risers', 'fallers'] as const;
export type FobesListId = (typeof FOBES_LIST_IDS)[number];

export interface FobesListDefinition {
  readonly id: FobesListId;
  readonly title: string;
  /** Tab label. */
  readonly short: string;
  readonly blurb: string;
}

export const FOBES_LISTS: Readonly<Record<FobesListId, FobesListDefinition>> = {
  'rich-list': {
    id: 'rich-list',
    title: 'The Lagos Rich List',
    short: 'Rich List',
    blurb: 'Everything they own: cash, savings, property, cars, businesses and investments.',
  },
  'self-made': {
    id: 'self-made',
    title: 'Self-made',
    short: 'Self-made',
    blurb: 'Net worth minus every naira they didn’t earn: no family money, gifts, sprays, inheritance or top-ups.',
  },
  'under-30': {
    id: 'under-30',
    title: 'Richest under 30',
    short: 'Under 30',
    blurb: 'The richest Lagosians who haven’t turned 30 yet (game years).',
  },
  risers: {
    id: 'risers',
    title: 'Biggest risers',
    short: 'Risers',
    blurb: 'Who gained the most over the past game week.',
  },
  fallers: {
    id: 'fallers',
    title: 'Biggest fallers',
    short: 'Fallers',
    blurb: 'Who lost the most over the past game week.',
  },
};

/** Each list shows the top 100 (your own rank is still worked out beyond it). Also the size of each daily snapshot. */
export const FOBES_LIST_LIMIT = 100;
export const FOBES_PAGE_SIZE = 20;
/** The last page a list can have. */
export const FOBES_MAX_PAGE = Math.ceil(FOBES_LIST_LIMIT / FOBES_PAGE_SIZE);
/** Under this age (whole game years) you're on the Under 30 list. */
export const FOBES_UNDER_AGE = 30;
/** "This game week": movers compare today with the snapshot this many game days ago. */
export const FOBES_MOVERS_WINDOW_DAYS = 7;
/** Snapshots older than this many game days are pruned (the window plus a day of slack). */
export const FOBES_SNAPSHOT_RETENTION_DAYS = FOBES_MOVERS_WINDOW_DAYS + 1;

export function isFobesMoversList(list: FobesListId): list is 'risers' | 'fallers' {
  return list === 'risers' || list === 'fallers';
}

/** Where a fortune came from, by the largest share of today's net worth. */
export const FOBES_WEALTH_SOURCES = ['none', 'self-made', 'mostly-self-made', 'inherited', 'family-money', 'topped-up', 'mixed'] as const;
export type FobesWealthSource = (typeof FOBES_WEALTH_SOURCES)[number];

export const FOBES_WEALTH_SOURCE_LABELS: Readonly<Record<FobesWealthSource, string>> = {
  none: 'Nothing to count yet',
  'self-made': 'Self-made',
  'mostly-self-made': 'Mostly self-made',
  inherited: 'Inherited',
  'family-money': 'Family money & gifts',
  'topped-up': 'Bought with top-ups',
  mixed: 'Earned, given and bought',
};
