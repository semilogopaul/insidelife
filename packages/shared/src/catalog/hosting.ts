/**
 * Hosting catalog — owned by the visits domain.
 *
 * While invited guests are inside your home you can treat them: a home-cooked pot from your pantry, food ordered in,
 * drinks, a cake, take-home packs or goodie bags. Treats are spending (the money leaves the game to the vendors), never
 * a transfer to the guest. The server prices every treat with the world price index (`ctx.world.price(price, now)`),
 * charges the host and lets each guest feel it in their own session. Prices are 2026 Lagos base prices (₦, VAT
 * included).
 */
import { MINUTES_PER_HOUR } from '../time/calendar.js';

export const HOST_TREAT_IDS = [
  'home-cooked',
  'jollof-chicken',
  'small-chops',
  'suya-platter',
  'pizza',
  'soft-drinks',
  'beer',
  'palm-wine',
  'champagne',
  'cake',
  'take-home-packs',
  'goodie-bags',
] as const;
export type HostTreatId = (typeof HOST_TREAT_IDS)[number];

/** Menu sections, in order. */
export const HOST_TREAT_KINDS = ['kitchen', 'food', 'drinks', 'sweet', 'send-off'] as const;
export type HostTreatKind = (typeof HOST_TREAT_KINDS)[number];

export const HOST_TREAT_KIND_LABELS: Readonly<Record<HostTreatKind, string>> = {
  kitchen: 'From your kitchen',
  food: 'Order in',
  drinks: 'Drinks',
  sweet: 'Something sweet',
  'send-off': 'For the road',
};

/** Instant need boosts (0-100 scale) and a mood lift for a while. */
export interface TreatEffects {
  readonly hunger?: number;
  readonly social?: number;
  readonly fun?: number;
  /** Mood points while the good feeling lasts… */
  readonly mood?: number;
  /** …for this many game hours. */
  readonly moodHours?: number;
}

/**
 * Who a treat is priced for: `everyone` (each guest and you — you eat too), `guest` (each guest: packs and bags go
 * home with them) or `once` (one cake for the room).
 */
export type TreatServing = 'everyone' | 'guest' | 'once';

export interface HostTreatDefinition {
  readonly id: HostTreatId;
  readonly kind: HostTreatKind;
  readonly name: string;
  readonly emoji: string;
  readonly blurb: string;
  /** ₦ per serving before the world price index (0 for the pantry pot). */
  readonly price: number;
  readonly per: TreatServing;
  /** Home-cooked: pantry meals per serving instead of cash. */
  readonly pantryMeals?: number;
  /** Alcohol: the host and every guest inside must be 18+. */
  readonly adultsOnly?: boolean;
  /** Game minutes it stays on the table (and can't be served again). */
  readonly lasts: number;
  /** What each guest gets (and the host too when `per` is `everyone`). */
  readonly effects: TreatEffects;
  /** Clout for generous hosting (the host; capped per game day). */
  readonly clout: number;
  /** Closeness with the host for a guest who knows them (capped per day per pair). */
  readonly closeness: number;
  /** The guest's notification: `{host}` is the host's first name. */
  readonly served: string;
}

const H = MINUTES_PER_HOUR;

export const HOST_TREATS: readonly HostTreatDefinition[] = [
  {
    id: 'home-cooked',
    kind: 'kitchen',
    name: 'Home-cooked jollof',
    emoji: '🍲',
    blurb: 'A pot from your kitchen stock, made with love. One pantry meal each, no money changes hands.',
    price: 0,
    per: 'everyone',
    pantryMeals: 1,
    lasts: 2 * H,
    effects: { hunger: 45, social: 8, mood: 4, moodHours: 6 },
    clout: 0,
    closeness: 2,
    served: '{host} cooked for you 🍲',
  },
  {
    id: 'jollof-chicken',
    kind: 'food',
    name: 'Jollof rice & chicken',
    emoji: '🍗',
    blurb: 'Party jollof, a big leg of chicken and dodo on the side, delivered hot.',
    price: 7_500,
    per: 'everyone',
    lasts: 2 * H,
    effects: { hunger: 55, social: 8, mood: 5, moodHours: 6 },
    clout: 1,
    closeness: 2,
    served: '{host} ordered jollof and chicken for you 🍗',
  },
  {
    id: 'small-chops',
    kind: 'food',
    name: 'Small chops platter',
    emoji: '🥟',
    blurb: 'Puff-puff, samosa, spring rolls and peppered gizzard. Owambe in a box.',
    price: 8_500,
    per: 'everyone',
    lasts: 2 * H,
    effects: { hunger: 30, social: 12, fun: 8, mood: 6, moodHours: 6 },
    clout: 1,
    closeness: 2,
    served: '{host} got small chops for you 🥟',
  },
  {
    id: 'suya-platter',
    kind: 'food',
    name: 'Suya platter',
    emoji: '🍢',
    blurb: 'Hot beef suya from the mallam, with onions, tomatoes and plenty yaji.',
    price: 9_000,
    per: 'everyone',
    lasts: 2 * H,
    effects: { hunger: 40, social: 10, fun: 8, mood: 6, moodHours: 6 },
    clout: 1,
    closeness: 2,
    served: '{host} ordered suya for you 🍢',
  },
  {
    id: 'pizza',
    kind: 'food',
    name: 'Pizza night',
    emoji: '🍕',
    blurb: 'Large pizzas from the Lekki branch. Someone will ask for pepper sauce.',
    price: 11_000,
    per: 'everyone',
    lasts: 2 * H,
    effects: { hunger: 50, social: 8, fun: 10, mood: 6, moodHours: 6 },
    clout: 1,
    closeness: 2,
    served: '{host} ordered pizza for you 🍕',
  },
  {
    id: 'soft-drinks',
    kind: 'drinks',
    name: 'Soft drinks & malt',
    emoji: '🥤',
    blurb: 'Chilled Coke, Fanta and Malta Guinness from the cooler.',
    price: 1_500,
    per: 'everyone',
    lasts: 90,
    effects: { social: 5, fun: 4, mood: 3, moodHours: 3 },
    clout: 0,
    closeness: 1,
    served: '{host} poured you a cold malt 🥤',
  },
  {
    id: 'beer',
    kind: 'drinks',
    name: 'Cold beer',
    emoji: '🍺',
    blurb: 'Star, Gulder or Trophy, sweating in the cooler. 18+ only.',
    price: 3_000,
    per: 'everyone',
    adultsOnly: true,
    lasts: 90,
    effects: { social: 8, fun: 8, mood: 4, moodHours: 4 },
    clout: 0,
    closeness: 1,
    served: '{host} cracked open a cold one for you 🍺',
  },
  {
    id: 'palm-wine',
    kind: 'drinks',
    name: 'Fresh palm wine',
    emoji: '🍶',
    blurb: 'Straight from the tapper in a keg. Sweet now, strong later. 18+ only.',
    price: 3_500,
    per: 'everyone',
    adultsOnly: true,
    lasts: 90,
    effects: { social: 10, fun: 10, mood: 5, moodHours: 4 },
    clout: 0,
    closeness: 2,
    served: '{host} shared fresh palm wine with you 🍶',
  },
  {
    id: 'champagne',
    kind: 'drinks',
    name: 'Champagne',
    emoji: '🍾',
    blurb: 'A bottle of Moët between two, popped like you won the league. 18+ only.',
    price: 60_000,
    per: 'everyone',
    adultsOnly: true,
    lasts: 2 * H,
    effects: { social: 12, fun: 12, mood: 8, moodHours: 8 },
    clout: 3,
    closeness: 3,
    served: '{host} popped champagne for you 🍾',
  },
  {
    id: 'cake',
    kind: 'sweet',
    name: 'Celebration cake',
    emoji: '🎂',
    blurb: 'Two tiers from a Lekki bakery. Somebody’s birthday — or just because.',
    price: 38_000,
    per: 'once',
    lasts: 3 * H,
    effects: { hunger: 15, social: 8, fun: 10, mood: 6, moodHours: 8 },
    clout: 1,
    closeness: 2,
    served: '{host} cut cake for you 🎂',
  },
  {
    id: 'take-home-packs',
    kind: 'send-off',
    name: 'Take-home packs',
    emoji: '🥡',
    blurb: 'Jollof and moi-moi wrapped in foil for the road. Mummy-approved.',
    price: 5_000,
    per: 'guest',
    lasts: 3 * H,
    effects: { hunger: 30, mood: 5, moodHours: 12 },
    clout: 0,
    closeness: 2,
    served: '{host} packed food for you to take home 🥡',
  },
  {
    id: 'goodie-bags',
    kind: 'send-off',
    name: 'Goodie bags',
    emoji: '🎁',
    blurb: 'Owambe-style souvenirs: a branded bowl, a hand fan and sweets.',
    price: 15_000,
    per: 'guest',
    lasts: 3 * H,
    effects: { fun: 6, mood: 6, moodHours: 24 },
    clout: 1,
    closeness: 3,
    served: '{host} gave you a goodie bag 🎁',
  },
];

const BY_ID = new Map<string, HostTreatDefinition>(HOST_TREATS.map((treat) => [treat.id, treat]));

export function findHostTreat(id: string): HostTreatDefinition | undefined {
  return BY_ID.get(id);
}

export const HOSTING_RULES = {
  /** Host rewards (social, mood and clout) come from at most this many treats per game day. */
  maxRewardedTreatsPerDay: 3,
  /** Clout from hosting per game day. */
  maxCloutPerDay: 3,
  /** What a host feels each rewarded treat. */
  hostReward: { social: 8, mood: 5, moodHours: 8 } satisfies TreatEffects,
  /** Closeness a guest can gain with one host per game day from treats. */
  maxClosenessPerDay: 6,
} as const;

/** Servings a treat is charged for: each guest and you, each guest, or once for the room. */
export function treatServings(per: TreatServing, guests: number): number {
  if (guests <= 0) return 0;
  if (per === 'once') return 1;
  return per === 'everyone' ? guests + 1 : guests;
}
