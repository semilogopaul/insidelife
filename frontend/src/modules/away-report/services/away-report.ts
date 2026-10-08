import type { NotificationDto, NotificationKind } from '@insidelife/shared';

/** How long you must be gone before the report shows (real ms). */
export const AWAY_THRESHOLD_MS = 5 * 60_000;

export const AWAY_CATEGORIES = ['salary', 'bills', 'health', 'family', 'money', 'habits', 'events', 'other'] as const;
export type AwayCategory = (typeof AWAY_CATEGORIES)[number];

const CATEGORY_OF: Readonly<Record<NotificationKind, AwayCategory>> = {
  salary: 'salary',
  bill: 'bills',
  health: 'health',
  family: 'family',
  relationship: 'family',
  'money-received': 'money',
  investment: 'money',
  property: 'money',
  career: 'events',
  education: 'events',
  promotion: 'events',
  achievement: 'events',
  social: 'events',
  world: 'events',
  system: 'other',
};

export const CATEGORY_LABELS: Readonly<Record<AwayCategory, string>> = {
  salary: 'Salary',
  bills: 'Bills & charges',
  health: 'Health',
  family: 'Family & love',
  money: 'Money in',
  habits: 'Your habits',
  events: 'What happened',
  other: 'Other',
};

export interface AwayGroup {
  readonly category: AwayCategory;
  readonly label: string;
  /** Newest first. */
  readonly items: readonly NotificationDto[];
  /** Net money across the group (₦, negative = spent). */
  readonly net: number;
}

export interface AwaySummary {
  readonly count: number;
  readonly moneyIn: number;
  readonly moneyOut: number;
  readonly net: number;
  /** Non-empty groups in display order (salary, bills, health, family, money, habits, events, other). */
  readonly groups: readonly AwayGroup[];
}

/** The weekly autopilot summary ("Your week of habits") arrives as an `achievement` notification. */
const HABITS_SUMMARY = /week of habits/i;

export function categoryOf(kind: NotificationKind, title = ''): AwayCategory {
  if (kind === 'achievement' && HABITS_SUMMARY.test(title)) return 'habits';
  return CATEGORY_OF[kind];
}

/**
 * Build the "While you were away" summary from notifications: only unread ones created at or after `sinceMs`,
 * grouped by what players care about, with money in/out summed.
 */
export function buildAwaySummary(notifications: readonly NotificationDto[], sinceMs: number): AwaySummary {
  const fresh = notifications
    .filter((notification) => !notification.read && Date.parse(notification.createdAt) >= sinceMs)
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.gameMinute - a.gameMinute);

  let moneyIn = 0;
  let moneyOut = 0;
  const buckets = new Map<AwayCategory, NotificationDto[]>();
  for (const notification of fresh) {
    const amount = notification.amount ?? 0;
    if (amount > 0) moneyIn += amount;
    else if (amount < 0) moneyOut += -amount;
    const category = categoryOf(notification.kind, notification.title);
    const bucket = buckets.get(category) ?? [];
    bucket.push(notification);
    buckets.set(category, bucket);
  }

  const groups: AwayGroup[] = [];
  for (const category of AWAY_CATEGORIES) {
    const items = buckets.get(category);
    if (!items || items.length === 0) continue;
    groups.push({ category, label: CATEGORY_LABELS[category], items, net: items.reduce((sum, item) => sum + (item.amount ?? 0), 0) });
  }
  return { count: fresh.length, moneyIn, moneyOut, net: moneyIn - moneyOut, groups };
}

/** Game time that passed while you were away ("3 days in Lagos"), from real ms and the clock scale. */
export function gameMinutesAway(realMs: number, scale: number): number {
  return Math.max(0, Math.round((realMs / 60_000) * scale));
}
