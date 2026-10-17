/**
 * "What's new" announcements: a small ordered catalog, oldest first. The newest one is shown once to every account
 * (new and existing) after onboarding; the server remembers the last one each account has seen. Pure and
 * dependency-free. To announce something, append an entry; never reorder or reuse ids.
 */

export interface AnnouncementAction {
  readonly label: string;
  /** Phone app to open, with an optional deep-link param (`openPhone(app, param)`). */
  readonly app: string;
  readonly param?: string;
}

export interface Announcement {
  readonly id: string;
  readonly title: string;
  /** Paragraphs, shown in order. */
  readonly body: readonly string[];
  readonly actions: readonly AnnouncementAction[];
  /** Which hero illustration to draw. */
  readonly hero: 'jet-abuja';
}

export const ANNOUNCEMENTS: readonly Announcement[] = [
  {
    id: 'private-jets-abuja',
    title: '✈️ Own your own private jet!',
    body: [
      'Buy a plane from a Cessna to a Gulfstream, paint it your colours, put your name on it, and fly it to Abuja, our new city.',
      'No plane yet? Book Air Peace or Ibom Air. Race your friends to Abuja and see who lands first!',
      '💰 Not enough money yet? Top up and get flying today.',
    ],
    actions: [
      { label: 'Open Hangar', app: 'hangar' },
      { label: 'Book a flight', app: 'flights' },
      { label: 'Race a friend', app: 'flights', param: 'race' },
      { label: 'Top up', app: 'bank', param: 'topup' },
    ],
    hero: 'jet-abuja',
  },
];

export const ANNOUNCEMENT_IDS: readonly string[] = ANNOUNCEMENTS.map((announcement) => announcement.id);

export function findAnnouncement(id: string, catalog: readonly Announcement[] = ANNOUNCEMENTS): Announcement | undefined {
  return catalog.find((announcement) => announcement.id === id);
}

/** The announcement to show an account whose last seen one is `lastSeen` (null: none yet), or null when up to date. */
export function pendingAnnouncement(lastSeen: string | null, catalog: readonly Announcement[] = ANNOUNCEMENTS): Announcement | null {
  const latest = catalog.at(-1);
  if (!latest) return null;
  const seenIndex = lastSeen === null ? -1 : catalog.findIndex((announcement) => announcement.id === lastSeen);
  return seenIndex < catalog.length - 1 ? latest : null;
}

/** Whether recording `id` moves an account forward from `lastSeen` (never backwards, so a stale device can't re-show). */
export function advancesAnnouncement(lastSeen: string | null, id: string, catalog: readonly Announcement[] = ANNOUNCEMENTS): boolean {
  const next = catalog.findIndex((announcement) => announcement.id === id);
  if (next < 0) return false;
  const seen = lastSeen === null ? -1 : catalog.findIndex((announcement) => announcement.id === lastSeen);
  return next > seen;
}
