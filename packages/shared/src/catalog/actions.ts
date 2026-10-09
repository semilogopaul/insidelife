import type { NeedDrift, NeedKey } from '../needs/needs.js';
import type { SkillKey } from './life.js';
import type { VenueType } from './venues.js';

/**
 * Player-chosen actions. Data-driven: the simulation engine applies need drift while an action runs and its
 * completion effects when it ends. Domain systems (relationships, health, education…) react to `hooks`.
 */

export const ACTION_CATEGORIES = ['rest', 'food', 'hygiene', 'fun', 'social', 'fitness', 'study', 'work', 'spiritual'] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

/** Avatar animation the 3D layer plays while the action runs. */
export const AVATAR_ANIMATIONS = [
  'idle',
  'walk',
  'sleep',
  'sit',
  'eat',
  'drink',
  'cook',
  'shower',
  'phone',
  'read',
  'type',
  'exercise',
  'dance',
  'talk',
  'pray',
  'drive',
  'wave',
  'cheer',
] as const;
export type AvatarAnimation = (typeof AVATAR_ANIMATIONS)[number];

/**
 * Domain hooks fired when an action completes. The owning backend module implements each hook.
 * - `meet-people`: relationships — maybe create an NPC acquaintance at this venue.
 * - `study`: education — progress JAMB prep / course mastery.
 * - `food-risk-low|high`: health — chance of typhoid / food poisoning.
 * - `family-call`: relationships — closeness with parents/siblings.
 * - `freelance`: careers — pay for freelance hours by tech skill.
 * - `worship`: relationships — community connections.
 * - `manage-business`: businesses — hands-on management improves this month's results.
 */
export const ACTION_HOOKS = [
  'meet-people',
  'study',
  'food-risk-low',
  'food-risk-high',
  'family-call',
  'freelance',
  'worship',
  'exercise',
  'manage-business',
] as const;
export type ActionHook = (typeof ACTION_HOOKS)[number];

export interface ActionDefinition {
  readonly id: string;
  readonly label: string;
  /** Present participle shown while running: "Sleeping", "Eating amala". */
  readonly verb: string;
  readonly emoji: string;
  readonly category: ActionCategory;
  /**
   * Where it can be done. `home` = own home; `visit` = someone else's home you were invited to; `anywhere` overrides
   * everything.
   */
  readonly where: { readonly home?: boolean; readonly visit?: boolean; readonly venueTypes?: readonly VenueType[]; readonly anywhere?: boolean };
  readonly durations: readonly number[];
  /** Base cost (₦) per run, before the world price index. */
  readonly cost: number;
  /** Takes a meal from the kitchen stock instead of charging `cost` when there is one (Cook). */
  readonly usesPantry?: boolean;
  /** Need drift overrides while running; unspecified needs follow the location's idle profile. */
  readonly drift: Partial<Record<NeedKey, NeedDrift>>;
  /** Skill XP per game hour. */
  readonly skillXpPerHour?: Partial<Record<SkillKey, number>>;
  /** Fitness gained per game hour. */
  readonly fitnessPerHour?: number;
  readonly statusOnComplete?: number;
  readonly hooks?: readonly ActionHook[];
  readonly requires?: {
    readonly minAge?: number;
    /** Character must own an item with one of these tags (e.g. `tv`, `laptop`). */
    readonly itemTag?: string;
    readonly minSkill?: Partial<Record<SkillKey, number>>;
  };
  readonly animation: AvatarAnimation;
  readonly blurb: string;
  /** Engine-managed (exploring the open world); never listed in action menus. */
  readonly system?: boolean;
}

const HOUR = 60;
const fill = (rate: number, target = 100): NeedDrift => ({ target, rate });
const drain = (rate: number, target = 0): NeedDrift => ({ target, rate });

export const ACTIONS = [
  // --- Open world (engine-managed) ----------------------------------------------------------------------------
  {
    id: 'explore',
    label: 'Explore',
    verb: 'Out and about',
    emoji: '🚶',
    category: 'fun',
    where: { anywhere: true },
    durations: [60],
    cost: 0,
    drift: { energy: drain(4, 20), fun: fill(4, 65), hygiene: drain(2, 35) },
    animation: 'walk',
    blurb: 'Walking or driving around Lagos. Kept alive by your heartbeat while you play.',
    system: true,
  },
  {
    id: 'home-meal',
    label: 'Eat at home',
    verb: 'Eating at home',
    emoji: '🍛',
    category: 'food',
    where: { home: true },
    durations: [30],
    cost: 0,
    drift: { hunger: fill(130) },
    animation: 'eat',
    blurb: 'Routine meal covered by your lifestyle budget. Happens automatically at mealtimes when you’re home.',
    system: true,
  },
  {
    id: 'write-exam',
    label: 'Write exam',
    verb: 'Writing an exam',
    emoji: '📝',
    category: 'study',
    where: { venueTypes: ['cbt-centre', 'campus'] },
    durations: [180],
    cost: 0,
    drift: { energy: drain(9, 15), fun: drain(6, 15) },
    animation: 'type',
    blurb: 'Started by the School app. Shine your eye.',
    system: true,
  },
  {
    id: 'treatment',
    label: 'See a doctor',
    verb: 'Getting treated',
    emoji: '🩺',
    category: 'rest',
    where: { venueTypes: ['hospital-public', 'hospital-private', 'pharmacy'] },
    durations: [30, 60, 120, 180, 240, 480],
    cost: 0,
    drift: { energy: fill(4, 60), fun: drain(4, 25) },
    animation: 'sit',
    blurb: 'Started by the Health app.',
    system: true,
  },
  {
    id: 'driving-test',
    label: 'FRSC driving test',
    verb: 'Taking the driving test',
    emoji: '🚦',
    category: 'study',
    where: { venueTypes: ['government'] },
    durations: [120],
    cost: 0,
    drift: { energy: drain(6, 25) },
    animation: 'drive',
    blurb: 'Started by the Motors app.',
    system: true,
  },
  {
    id: 'hang-around',
    label: 'Hang around',
    verb: 'Looking around',
    emoji: '👀',
    category: 'fun',
    where: { anywhere: true },
    durations: [90],
    cost: 0,
    drift: { fun: { target: 55, rate: 3 } },
    animation: 'idle',
    blurb: 'You just arrived somewhere on purpose — autopilot waits a while before taking you home.',
    system: true,
  },
  // --- Rest ---------------------------------------------------------------------------------------------------
  {
    id: 'sleep',
    label: 'Sleep',
    verb: 'Sleeping',
    emoji: '😴',
    category: 'rest',
    where: { home: true },
    durations: [4 * HOUR, 6 * HOUR, 8 * HOUR, 10 * HOUR],
    cost: 0,
    drift: { energy: fill(12), hunger: drain(2.5, 25), hygiene: drain(1.5, 35), fun: { target: 50, rate: 0.5 }, social: { target: 40, rate: 0.5 } },
    animation: 'sleep',
    blurb: 'Recharge properly. A better bed recharges faster.',
  },
  {
    id: 'nap',
    label: 'Take a nap',
    verb: 'Napping',
    emoji: '💤',
    category: 'rest',
    where: { home: true },
    durations: [HOUR, 2 * HOUR],
    cost: 0,
    drift: { energy: fill(14) },
    animation: 'sleep',
    blurb: 'Quick recharge.',
  },
  // --- Food ---------------------------------------------------------------------------------------------------
  {
    id: 'cook',
    label: 'Cook a pot of stew',
    verb: 'Cooking',
    emoji: '🍲',
    category: 'food',
    where: { home: true },
    durations: [HOUR],
    cost: 3_000,
    usesPantry: true,
    drift: { hunger: fill(110), fun: { target: 65, rate: 6 } },
    skillXpPerHour: { cooking: 0.5 },
    animation: 'cook',
    blurb: 'Uses a meal from your kitchen stock; with nothing in, a quick market run. You get better at it.',
  },
  {
    id: 'order-food',
    label: 'Order Chowdeck',
    verb: 'Waiting for the rider',
    emoji: '🛵',
    category: 'food',
    where: { home: true, venueTypes: ['office', 'campus'] },
    durations: [45],
    cost: 7_000,
    drift: { hunger: fill(140), fun: { target: 70, rate: 12 } },
    hooks: ['food-risk-low'],
    animation: 'phone',
    blurb: 'Delivery fee is criminal but the jollof is hot.',
  },
  {
    id: 'eat-buka',
    label: 'Eat at the buka',
    verb: 'Eating amala',
    emoji: '🥘',
    category: 'food',
    where: { venueTypes: ['buka'] },
    durations: [45],
    cost: 3_500,
    drift: { hunger: fill(140), fun: { target: 70, rate: 10 }, social: { target: 70, rate: 10 } },
    hooks: ['food-risk-low', 'meet-people'],
    animation: 'eat',
    blurb: 'Amala, gbegiri, ewedu, assorted meat. Worth the queue.',
  },
  {
    id: 'street-food',
    label: 'Buy street food',
    verb: 'Eating roadside jollof',
    emoji: '🍛',
    category: 'food',
    where: { venueTypes: ['market', 'motor-park', 'campus', 'beach', 'park'] },
    durations: [20],
    cost: 1_800,
    drift: { hunger: fill(220, 85) },
    hooks: ['food-risk-high'],
    animation: 'eat',
    blurb: 'Cheap and fast. Your stomach will decide.',
  },
  {
    id: 'fine-dining',
    label: 'Fine dining',
    verb: 'Dining in style',
    emoji: '🍷',
    category: 'food',
    where: { venueTypes: ['restaurant'] },
    durations: [2 * HOUR],
    cost: 75_000,
    drift: { hunger: fill(80), fun: fill(25, 95), social: fill(20, 90) },
    statusOnComplete: 2,
    hooks: ['meet-people'],
    animation: 'eat',
    blurb: 'Tasting menu, wine pairing, pictures for the gram.',
  },
  // --- Hygiene ------------------------------------------------------------------------------------------------
  {
    id: 'shower',
    label: 'Bath',
    verb: 'Bathing',
    emoji: '🚿',
    category: 'hygiene',
    where: { home: true, venueTypes: ['gym'] },
    durations: [20],
    cost: 0,
    drift: { hygiene: fill(300), energy: fill(10, 70) },
    animation: 'shower',
    blurb: 'Bucket or shower, you go smell better.',
  },
  // --- Fun ----------------------------------------------------------------------------------------------------
  {
    id: 'watch-tv',
    label: 'Watch Nollywood',
    verb: 'Watching TV',
    emoji: '📺',
    category: 'fun',
    where: { home: true },
    durations: [HOUR, 2 * HOUR],
    cost: 0,
    drift: { fun: fill(25, 88), energy: drain(2, 20) },
    requires: { itemTag: 'tv' },
    animation: 'sit',
    blurb: 'Needs a TV. NEPA permitting.',
  },
  {
    id: 'visit-hangout',
    label: 'Hang out',
    verb: 'Hanging out',
    emoji: '🛋️',
    category: 'social',
    where: { visit: true },
    durations: [HOUR, 2 * HOUR, 3 * HOUR],
    cost: 0,
    drift: { social: fill(30, 92), fun: fill(14, 80) },
    animation: 'talk',
    blurb: 'Gist, music and small chops at their place. Free — just don’t finish their Fanta.',
  },
  {
    id: 'scroll',
    label: 'Scroll social media',
    verb: 'Scrolling',
    emoji: '📱',
    category: 'fun',
    where: { anywhere: true },
    durations: [30, HOUR],
    cost: 0,
    drift: { fun: fill(18, 72), social: fill(10, 55) },
    animation: 'phone',
    blurb: 'Free entertainment. Data no be water though.',
  },
  {
    id: 'play-games',
    label: 'Play FIFA',
    verb: 'Gaming',
    emoji: '🎮',
    category: 'fun',
    where: { home: true },
    durations: [HOUR, 2 * HOUR],
    cost: 0,
    drift: { fun: fill(30, 96), energy: drain(3, 20) },
    requires: { itemTag: 'console' },
    animation: 'sit',
    blurb: 'Needs a console. One more match.',
  },
  {
    id: 'cinema',
    label: 'Catch a movie',
    verb: 'At the movies',
    emoji: '🎬',
    category: 'fun',
    where: { venueTypes: ['cinema'] },
    durations: [150],
    cost: 8_000,
    drift: { fun: fill(28, 96), social: fill(12, 75) },
    hooks: ['meet-people'],
    animation: 'sit',
    blurb: 'Popcorn costs more than the ticket.',
  },
  {
    id: 'window-shop',
    label: 'Window shop',
    verb: 'Browsing',
    emoji: '🛍️',
    category: 'fun',
    where: { venueTypes: ['mall', 'market'] },
    durations: [HOUR],
    cost: 0,
    drift: { fun: fill(12, 70), energy: drain(5, 20) },
    hooks: ['meet-people'],
    animation: 'walk',
    blurb: 'Look, don’t buy. Air conditioning is free.',
  },
  {
    id: 'beach-day',
    label: 'Beach hangout',
    verb: 'Chilling at the beach',
    emoji: '🏖️',
    category: 'fun',
    where: { venueTypes: ['beach'] },
    durations: [2 * HOUR, 3 * HOUR],
    cost: 8_000,
    drift: { fun: fill(20, 96), social: fill(14, 85), hygiene: drain(5, 35) },
    hooks: ['meet-people'],
    animation: 'dance',
    blurb: 'Gate fee, suya, coconut and a horse ride.',
  },
  {
    id: 'park-chill',
    label: 'Walk around',
    verb: 'Exploring',
    emoji: '🌳',
    category: 'fun',
    where: { venueTypes: ['park'] },
    durations: [HOUR, 2 * HOUR],
    cost: 2_000,
    drift: { fun: fill(14, 85), energy: drain(5, 20) },
    hooks: ['meet-people'],
    animation: 'walk',
    blurb: 'Art, canopy walks and fresh(ish) air.',
  },
  // --- Social -------------------------------------------------------------------------------------------------
  {
    id: 'lounge',
    label: 'Drinks at the lounge',
    verb: 'Having drinks',
    emoji: '🍹',
    category: 'social',
    where: { venueTypes: ['bar'] },
    durations: [2 * HOUR, 3 * HOUR],
    cost: 18_000,
    drift: { fun: fill(20, 90), social: fill(26, 96), energy: drain(6, 25) },
    hooks: ['meet-people'],
    animation: 'drink',
    blurb: 'Chapman, suya and loud opinions.',
  },
  {
    id: 'club-night',
    label: 'Turn up at the club',
    verb: 'Turning up',
    emoji: '🪩',
    category: 'social',
    where: { venueTypes: ['club'] },
    durations: [4 * HOUR],
    cost: 65_000,
    drift: { fun: fill(24, 100), social: fill(24, 100), energy: drain(14, 5), hygiene: drain(8, 25) },
    statusOnComplete: 4,
    hooks: ['meet-people'],
    animation: 'dance',
    blurb: 'Table, bottles, sparklers. The DJ knows your name now.',
  },
  {
    id: 'meet-people',
    label: 'Mingle',
    verb: 'Mingling',
    emoji: '🤝',
    category: 'social',
    where: {
      venueTypes: ['bar', 'club', 'beach', 'park', 'event-centre', 'campus', 'mall', 'gym', 'church', 'mosque', 'office', 'buka'],
    },
    durations: [HOUR],
    cost: 0,
    drift: { social: fill(24, 90), fun: fill(8, 70) },
    skillXpPerHour: { charisma: 0.33 },
    hooks: ['meet-people'],
    animation: 'talk',
    blurb: 'Make new connections. Man know man.',
  },
  {
    id: 'call-family',
    label: 'Call family',
    verb: 'On the phone with family',
    emoji: '📞',
    category: 'social',
    where: { anywhere: true },
    durations: [30],
    cost: 500,
    drift: { social: fill(40, 85) },
    hooks: ['family-call'],
    animation: 'phone',
    blurb: 'Mummy wants to know when you’re bringing someone home.',
  },
  // --- Spiritual ----------------------------------------------------------------------------------------------
  {
    id: 'worship',
    label: 'Attend service',
    verb: 'Worshipping',
    emoji: '🙏',
    category: 'spiritual',
    where: { venueTypes: ['church', 'mosque'] },
    durations: [2 * HOUR],
    cost: 1_000,
    drift: { social: fill(20, 88), fun: fill(8, 65) },
    hooks: ['worship', 'meet-people'],
    animation: 'pray',
    blurb: 'Community, choir and the offering basket.',
  },
  // --- Fitness ------------------------------------------------------------------------------------------------
  {
    id: 'gym',
    label: 'Gym session',
    verb: 'Working out',
    emoji: '🏋️',
    category: 'fitness',
    where: { venueTypes: ['gym'] },
    durations: [90],
    cost: 3_000,
    drift: { energy: drain(18, 5), hygiene: drain(25, 10), fun: fill(6, 65) },
    fitnessPerHour: 1.6,
    skillXpPerHour: { fitness: 0.75 },
    hooks: ['exercise', 'meet-people'],
    animation: 'exercise',
    blurb: 'Leg day. Don’t skip it.',
  },
  {
    id: 'jog',
    label: 'Go for a jog',
    verb: 'Jogging',
    emoji: '🏃',
    category: 'fitness',
    where: { venueTypes: ['park', 'beach'] },
    durations: [HOUR],
    cost: 0,
    drift: { energy: drain(16, 10), hygiene: drain(22, 15), fun: fill(5, 60) },
    fitnessPerHour: 1.2,
    skillXpPerHour: { fitness: 0.62 },
    hooks: ['exercise'],
    animation: 'exercise',
    blurb: 'Free cardio with a view.',
  },
  {
    id: 'home-workout',
    label: 'Home workout',
    verb: 'Doing press-ups',
    emoji: '💪',
    category: 'fitness',
    where: { home: true },
    durations: [45],
    cost: 0,
    drift: { energy: drain(16, 10), hygiene: drain(22, 15) },
    fitnessPerHour: 1,
    skillXpPerHour: { fitness: 0.5 },
    hooks: ['exercise'],
    animation: 'exercise',
    blurb: 'YouTube workout in your room.',
  },
  // --- Study --------------------------------------------------------------------------------------------------
  {
    id: 'study',
    label: 'Study',
    verb: 'Reading',
    emoji: '📚',
    category: 'study',
    where: { home: true, venueTypes: ['campus'] },
    durations: [HOUR, 2 * HOUR, 3 * HOUR],
    cost: 0,
    drift: { energy: drain(7, 15), fun: drain(5, 20) },
    skillXpPerHour: { intellect: 0.27 },
    hooks: ['study'],
    animation: 'read',
    blurb: 'JAMB prep, course work or certification. Campus library gives a boost.',
  },
  {
    id: 'learn-code',
    label: 'Learn to code',
    verb: 'Debugging',
    emoji: '💻',
    category: 'study',
    where: { home: true, venueTypes: ['campus', 'office'] },
    durations: [HOUR, 2 * HOUR, 3 * HOUR],
    cost: 0,
    drift: { energy: drain(7, 15), fun: drain(4, 25) },
    skillXpPerHour: { tech: 0.3 },
    requires: { itemTag: 'laptop' },
    animation: 'type',
    blurb: 'Needs a laptop. Tech pays — in dollars, eventually.',
  },
  {
    id: 'practice-craft',
    label: 'Practise a trade',
    verb: 'Practising',
    emoji: '🧵',
    category: 'study',
    where: { home: true, venueTypes: ['market', 'salon'] },
    durations: [HOUR, 2 * HOUR],
    cost: 1_500,
    drift: { energy: drain(6, 20) },
    skillXpPerHour: { trade: 0.37 },
    animation: 'type',
    blurb: 'Tailoring, hair, repairs — skills that always pay.',
  },
  {
    id: 'make-content',
    label: 'Make content',
    verb: 'Filming a skit',
    emoji: '🎥',
    category: 'study',
    where: { anywhere: true },
    durations: [HOUR, 2 * HOUR],
    cost: 0,
    drift: { fun: fill(10, 80), energy: drain(6, 20) },
    skillXpPerHour: { creative: 0.3, charisma: 0.1 },
    animation: 'talk',
    blurb: 'Skits, dance challenges, GRWM. The algorithm is watching.',
  },
  // --- Work-adjacent ------------------------------------------------------------------------------------------
  {
    id: 'manage-business',
    label: 'Manage your business',
    verb: 'Running the business',
    emoji: '📈',
    category: 'work',
    where: { anywhere: true },
    durations: [2 * HOUR, 4 * HOUR],
    cost: 0,
    drift: { energy: drain(6, 20), fun: drain(2, 35) },
    skillXpPerHour: { business: 0.33, charisma: 0.07 },
    requires: { itemTag: 'business' },
    hooks: ['manage-business'],
    animation: 'phone',
    blurb: 'Calls with suppliers, staff and customers. Owners who show up earn more.',
  },
  {
    id: 'freelance',
    label: 'Freelance gig',
    verb: 'Freelancing',
    emoji: '🧑‍💻',
    category: 'work',
    where: { home: true, venueTypes: ['office'] },
    durations: [2 * HOUR, 4 * HOUR],
    cost: 0,
    drift: { energy: drain(8, 10), fun: drain(4, 20) },
    skillXpPerHour: { tech: 0.1, business: 0.05 },
    requires: { itemTag: 'laptop', minSkill: { tech: 20 } },
    hooks: ['freelance'],
    animation: 'type',
    blurb: 'Fix someone’s website for naira. Pay scales with your tech skill.',
  },
] as const satisfies readonly ActionDefinition[];

export type ActionId = (typeof ACTIONS)[number]['id'];

/**
 * Engine-managed "soft" states (exploring the streets, hanging around after arriving somewhere). Any player command
 * may replace them; they never make the character "busy".
 */
export const INTERRUPTIBLE_ACTIONS: ReadonlySet<string> = new Set(['explore', 'hang-around']);

export function isInterruptibleAction(actionId: string | null | undefined): boolean {
  return actionId !== null && actionId !== undefined && INTERRUPTIBLE_ACTIONS.has(actionId);
}

/**
 * Who started an activity, stored in its `targetId` when the autopilot did: `autopilot` for routine sleep and meals,
 * `habit` for a daily-habit session. Both give way to anything the player does.
 */
export const AUTOPILOT_TARGET = 'autopilot';
export const HABIT_TARGET = 'habit';

/** Whether a running activity may be replaced by a player command (move, start an action, write an exam…). */
export function isInterruptibleActivity(activity: { readonly actionId: string; readonly targetId?: string } | null | undefined): boolean {
  if (!activity) return true;
  return isInterruptibleAction(activity.actionId) || activity.targetId === AUTOPILOT_TARGET || activity.targetId === HABIT_TARGET;
}

const ACTION_INDEX: ReadonlyMap<string, ActionDefinition> = new Map(ACTIONS.map((action) => [action.id, action]));

export function findAction(id: string): ActionDefinition | undefined {
  return ACTION_INDEX.get(id);
}
