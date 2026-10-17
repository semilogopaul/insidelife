/**
 * Progression catalog — owned by the progression domain: Life Goals (guided quests in chapters), achievements,
 * milestone moments and the daily welcome. Pure data plus a tiny condition language the server evaluates; the client
 * reads the same definitions to render checklists, hints, GPS targets and badge walls.
 */
import type { ActionCategory, ActionHook, ActionId } from './actions.js';
import type { DistrictId } from './geography.js';
import type { BackgroundId, LifestyleTier, SkillKey } from './life.js';
import type { TransportMode } from './transport.js';
import type { VenueType } from './venues.js';
import { boosted } from '../money/income-multiplier.js';
import { MINUTES_PER_DAY } from '../time/calendar.js';

// ----- Signals -----------------------------------------------------------------------------------------------------

/**
 * Facts only another domain can see (a spray at an owambe, an accepted friend request). Domains report them through
 * the progression signals port; each signal keeps a count (`signal:<id>`) and a naira total (`signal-total:<id>`).
 */
export const PROGRESSION_SIGNALS = [
  'friend-added',
  'owambe-attended',
  'owambe-sprayed',
  'owambe-hosted',
  'black-tax-paid',
  'checkpoint-survived',
] as const;
export type ProgressionSignal = (typeof PROGRESSION_SIGNALS)[number];

// ----- Counters ----------------------------------------------------------------------------------------------------

/**
 * Everything the server counts per character. Flags (first visits, "stepped outside") are counters stuck at 1.
 * - `action:<id>` / `category:<c>` / `hook:<h>` — completed actions
 * - `trip:<mode>` / `rain-trip:<mode>` / `trips` — completed rides and drives
 * - `venue:<id>` (flag), `venue-type:<type>` / `venues` — distinct places visited
 * - `district:<id>` (flag) / `districts`, `city:<id>` (flag) / `cities` — distinct districts and cities other than Lagos
 * - `outside`, `street-late`, `had:<illness>` — flags
 * - `lagoon-crossings`, `bridge-drives`, `bridge-sunset`, `long-trips`, `detty-club`, `promotions`, `salary-months`,
 *   `strike-days`, `welcome-sunday` — tallies
 */
export type ProgressionCounterKey =
  | `action:${string}`
  | `category:${ActionCategory}`
  | `hook:${ActionHook}`
  | `trip:${TransportMode}`
  | `rain-trip:${TransportMode}`
  | 'trips'
  | `venue:${string}`
  | `venue-type:${VenueType}`
  | 'venues'
  | `district:${DistrictId}`
  | 'districts'
  | `city:${string}`
  | 'cities'
  | 'outside'
  | 'street-late'
  | `had:${string}`
  | 'lagoon-crossings'
  | 'bridge-drives'
  | 'bridge-sunset'
  | 'long-trips'
  | 'detty-club'
  | 'promotions'
  | 'salary-months'
  | 'strike-days'
  | 'welcome-sunday'
  | `signal:${ProgressionSignal}`
  | `signal-total:${ProgressionSignal}`;

/** Typed builders so catalog entries can't misspell a counter key. */
export const progressionCounter = {
  action: (id: ActionId): ProgressionCounterKey => `action:${id}`,
  category: (category: ActionCategory): ProgressionCounterKey => `category:${category}`,
  hook: (hook: ActionHook): ProgressionCounterKey => `hook:${hook}`,
  trip: (mode: TransportMode): ProgressionCounterKey => `trip:${mode}`,
  rainTrip: (mode: TransportMode): ProgressionCounterKey => `rain-trip:${mode}`,
  venue: (venueId: string): ProgressionCounterKey => `venue:${venueId}`,
  venueType: (type: VenueType): ProgressionCounterKey => `venue-type:${type}`,
  district: (districtId: DistrictId): ProgressionCounterKey => `district:${districtId}`,
  city: (cityId: string): ProgressionCounterKey => `city:${cityId}`,
  had: (illnessId: string): ProgressionCounterKey => `had:${illnessId}`,
  signal: (signal: ProgressionSignal): ProgressionCounterKey => `signal:${signal}`,
  signalTotal: (signal: ProgressionSignal): ProgressionCounterKey => `signal-total:${signal}`,
} as const;

// ----- Conditions --------------------------------------------------------------------------------------------------

export type ProgressionHomeOwnership = 'family' | 'rented' | 'owned' | 'hostel';
export type ProgressionRelationship = 'single' | 'dating' | 'engaged' | 'married' | 'widowed' | 'divorced';
export type ProgressionDegreeGrade =
  | 'first'
  | 'second-upper'
  | 'second-lower'
  | 'third'
  | 'pass'
  | 'distinction'
  | 'upper-credit'
  | 'lower-credit';

/**
 * A tiny, serialisable condition language. The server evaluates it against counters, the character and domain ports;
 * the client only displays it. Leaves are cheap (counters, character) or need a domain lookup (credentials, job…).
 */
export type ProgressionCondition =
  | { readonly kind: 'always' }
  | { readonly kind: 'counter'; readonly key: ProgressionCounterKey; readonly atLeast: number }
  | { readonly kind: 'status'; readonly atLeast: number }
  | { readonly kind: 'skill'; readonly skill: SkillKey; readonly atLeast: number }
  | { readonly kind: 'fitness'; readonly atLeast: number }
  | { readonly kind: 'age'; readonly atLeast: number }
  | { readonly kind: 'generation'; readonly atLeast: number }
  | { readonly kind: 'background'; readonly in: readonly BackgroundId[] }
  | { readonly kind: 'lifestyle'; readonly in: readonly LifestyleTier[] }
  | { readonly kind: 'earned'; readonly atLeast: number }
  | { readonly kind: 'item-tag'; readonly tag: string }
  | { readonly kind: 'power-backup' }
  | { readonly kind: 'jamb-registered' }
  | { readonly kind: 'jamb-written' }
  | { readonly kind: 'jamb-score'; readonly atLeast: number }
  | { readonly kind: 'admitted' }
  | { readonly kind: 'degree'; readonly grades?: readonly ProgressionDegreeGrade[] }
  | { readonly kind: 'certification'; readonly anyOf: readonly string[] }
  | { readonly kind: 'nysc-completed' }
  | { readonly kind: 'employed' }
  | { readonly kind: 'monthly-pay'; readonly atLeast: number }
  | { readonly kind: 'home'; readonly ownership: readonly ProgressionHomeOwnership[]; readonly districts?: readonly DistrictId[] }
  | { readonly kind: 'property-value'; readonly atLeast: number }
  | { readonly kind: 'relationship'; readonly in: readonly ProgressionRelationship[] }
  | { readonly kind: 'children'; readonly atLeast: number; readonly minAge?: number }
  | { readonly kind: 'savings'; readonly atLeast: number }
  | { readonly kind: 'not-ill'; readonly conditionId: string }
  | { readonly kind: 'all'; readonly of: readonly ProgressionCondition[] }
  | { readonly kind: 'any'; readonly of: readonly ProgressionCondition[] };

export type ProgressionConditionKind = ProgressionCondition['kind'];

const always = (): ProgressionCondition => ({ kind: 'always' });
const count = (key: ProgressionCounterKey, atLeast = 1): ProgressionCondition => ({ kind: 'counter', key, atLeast });
const did = (actionId: ActionId, atLeast = 1): ProgressionCondition => count(progressionCounter.action(actionId), atLeast);
const rode = (mode: TransportMode, atLeast = 1): ProgressionCondition => count(progressionCounter.trip(mode), atLeast);
const visited = (type: VenueType, atLeast = 1): ProgressionCondition => count(progressionCounter.venueType(type), atLeast);
const signalled = (signal: ProgressionSignal, atLeast = 1): ProgressionCondition => count(progressionCounter.signal(signal), atLeast);
const status = (atLeast: number): ProgressionCondition => ({ kind: 'status', atLeast });
const skill = (name: SkillKey, atLeast: number): ProgressionCondition => ({ kind: 'skill', skill: name, atLeast });
const background = (...ids: BackgroundId[]): ProgressionCondition => ({ kind: 'background', in: ids });
const earned = (atLeast: number): ProgressionCondition => ({ kind: 'earned', atLeast });
const owns = (tag: string): ProgressionCondition => ({ kind: 'item-tag', tag });
const certified = (...anyOf: string[]): ProgressionCondition => ({ kind: 'certification', anyOf });
const home = (ownership: ProgressionHomeOwnership[], districts?: DistrictId[]): ProgressionCondition =>
  districts ? { kind: 'home', ownership, districts } : { kind: 'home', ownership };
const relationship = (...statuses: ProgressionRelationship[]): ProgressionCondition => ({ kind: 'relationship', in: statuses });
const children = (atLeast: number, minAge?: number): ProgressionCondition =>
  minAge === undefined ? { kind: 'children', atLeast } : { kind: 'children', atLeast, minAge };
const allOf = (...of: ProgressionCondition[]): ProgressionCondition => ({ kind: 'all', of });
const anyOf = (...of: ProgressionCondition[]): ProgressionCondition => ({ kind: 'any', of });

// ----- Milestone moments -------------------------------------------------------------------------------------------

/**
 * Full-screen celebrations (peak-end rule): confetti, music sting, shareable card. The client shows each pending
 * moment once and acknowledges it. `{name}` and `{detail}` are filled in by the server.
 */
export interface MilestoneMomentDefinition {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** lucide icon name. */
  readonly icon: string;
  /** Pre-filled text for the share sheet. */
  readonly shareText: string;
  /** Repeatable moments (promotions, chapters) are de-duplicated per occurrence instead of once per life. */
  readonly repeatable: boolean;
}

export const MILESTONE_MOMENTS = [
  {
    id: 'first-salary',
    title: 'Alert don land!',
    body: '{name}, your first salary just landed{detail}. Screenshot am — this one na history.',
    icon: 'banknote',
    shareText: 'My first salary don land for Inside Life! 💸',
    repeatable: false,
  },
  {
    id: 'admission',
    title: 'Admission letter!',
    body: 'Congratulations {name}! You’ve been admitted{detail}. Mama is calling everybody in the compound.',
    icon: 'mail-open',
    shareText: 'I don gain admission for Inside Life! 🎓',
    repeatable: false,
  },
  {
    id: 'graduation',
    title: 'You don graduate!',
    body: '{name}, it’s official{detail}. Convocation photos, aso-ebi, the works.',
    icon: 'graduation-cap',
    shareText: 'Graduated in Inside Life! Ask me about my ASUU stories. 🎓',
    repeatable: false,
  },
  {
    id: 'first-car',
    title: 'First whip!',
    body: '{name} now owns a car{detail}. Learn which roads flood before rainy season.',
    icon: 'car',
    shareText: 'Just got my first whip in Inside Life 🚗',
    repeatable: false,
  },
  {
    id: 'wedding',
    title: 'Wedding bells!',
    body: '{name} is married{detail}! The aso-ebi was loud, the jollof was louder.',
    icon: 'heart-handshake',
    shareText: 'We don do am! Married in Inside Life 💍',
    repeatable: false,
  },
  {
    id: 'first-child',
    title: 'Welcome, little one!',
    body: '{name} is now a parent{detail}. The naming ceremony list is already long.',
    icon: 'baby',
    shareText: 'Omo tuntun! Our first child arrived in Inside Life 👶🏾',
    repeatable: false,
  },
  {
    id: 'first-property',
    title: 'Property owner!',
    body: '{name} now owns property in Lagos{detail}. Land no dey spoil.',
    icon: 'landmark',
    shareText: 'Landlord loading… I own property in Inside Life 🏠',
    repeatable: false,
  },
  {
    id: 'moved-out',
    title: 'Your own key!',
    body: '{name} has moved out of the family house{detail}. Freedom smells like fresh paint.',
    icon: 'key-round',
    shareText: 'Moved into my own place in Inside Life 🔑',
    repeatable: false,
  },
  {
    id: 'promotion',
    title: 'Promoted!',
    body: '{name} has been promoted{detail}. New title, new signature, same Lagos traffic.',
    icon: 'trending-up',
    shareText: 'Levels have changed — promoted in Inside Life 📈',
    repeatable: true,
  },
  {
    id: 'heir-takes-over',
    title: 'The heir takes over',
    body: '{name} now carries the family name{detail}. The house, the history — and the expectations.',
    icon: 'crown',
    shareText: 'The next generation takes over in Inside Life 👑',
    repeatable: false,
  },
  {
    id: 'big-man',
    title: 'Big Man / Big Woman!',
    body: '{name} has reached Big Man/Big Woman status{detail}. When you enter, people stand up.',
    icon: 'gem',
    shareText: 'Big Man / Big Woman status unlocked in Inside Life 😎',
    repeatable: false,
  },
  {
    id: 'path-chosen',
    title: 'You don find your path',
    body: '{name} has chosen a lane{detail}. Lagos rewards people who commit.',
    icon: 'compass',
    shareText: 'Found my path in Inside Life 🧭',
    repeatable: false,
  },
  {
    id: 'chapter-complete',
    title: 'Chapter complete!',
    body: '{name} finished “{detail}”. On to the next chapter of your life.',
    icon: 'book-open',
    shareText: 'Another chapter of my Lagos life complete in Inside Life 📖',
    repeatable: true,
  },
  {
    id: 'legacy-complete',
    title: 'A life well lived',
    body: '{name} has completed every chapter of Life Goals{detail}. Legend status: confirmed.',
    icon: 'crown',
    shareText: 'Completed every Life Goal in Inside Life. Legend! 👑',
    repeatable: false,
  },
] as const satisfies readonly MilestoneMomentDefinition[];

export type MilestoneMomentId = (typeof MILESTONE_MOMENTS)[number]['id'];

const MILESTONE_INDEX: ReadonlyMap<string, MilestoneMomentDefinition> = new Map(MILESTONE_MOMENTS.map((moment) => [moment.id, moment]));

export function findMilestoneMoment(id: string): MilestoneMomentDefinition | undefined {
  return MILESTONE_INDEX.get(id);
}

// ----- Life Goals --------------------------------------------------------------------------------------------------

/** `toast` = chime + confetti in the HUD; `moment` = big milestone (bigger animation, usually a milestone card). */
export type CelebrationLevel = 'toast' | 'moment';

export interface LifeChapterDefinition {
  readonly number: number;
  readonly id: string;
  readonly title: string;
  readonly tagline: string;
}

export const LIFE_CHAPTERS = [
  { number: 1, id: 'welcome-to-lagos', title: 'Welcome to Lagos', tagline: 'Find your feet. Eko no dey carry last.' },
  { number: 2, id: 'finding-your-path', title: 'Finding your path', tagline: 'School, trade or tech — choose your hustle.' },
  { number: 3, id: 'building', title: 'Building', tagline: 'Your own key, your own money, your own name.' },
  { number: 4, id: 'legacy', title: 'Legacy', tagline: 'Marriage, children, property — and someone to carry it on.' },
] as const satisfies readonly LifeChapterDefinition[];

export interface LifeGoalReward {
  /** Naira paid as earned income (small next to salaries). */
  readonly cash: number;
  /** Permanent clout from progression (capped by PROGRESSION_CLOUT_CAP). */
  readonly clout: number;
  /** Optional item granted through the inventory port (must exist in the shop catalog). */
  readonly item?: { readonly itemId: string; readonly label: string };
}

export interface LifeGoalBonus {
  readonly label: string;
  readonly condition: ProgressionCondition;
  readonly cash: number;
  readonly clout: number;
}

/** One way to complete a branching goal ("Register for JAMB — or take a job"). */
export interface LifeGoalPath {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly condition: ProgressionCondition;
  readonly targetVenueTypes?: readonly VenueType[];
  readonly milestone?: MilestoneMomentId;
}

export interface LifeGoalDefinition {
  readonly id: string;
  readonly chapter: number;
  /** Display order within the chapter. */
  readonly order: number;
  readonly title: string;
  readonly description: string;
  /** Concrete next step for the HUD. */
  readonly hint: string;
  /** Venue types the client can offer GPS to. */
  readonly targetVenueTypes?: readonly VenueType[];
  /** Action the HUD can offer as a one-tap shortcut when the player is at a matching venue. */
  readonly suggestedActionId?: ActionId;
  /** Completion rule. For branching goals this is "any path" (see `paths`). */
  readonly condition: ProgressionCondition;
  readonly paths?: readonly LifeGoalPath[];
  /** Optional goals never block the next chapter. */
  readonly optional?: boolean;
  /** Goals that must be complete before this one activates. */
  readonly after?: readonly string[];
  /** Ticked at character creation (endowed progress). */
  readonly preCompleted?: boolean;
  readonly reward: LifeGoalReward;
  readonly bonus?: LifeGoalBonus;
  readonly celebration: CelebrationLevel;
  readonly milestone?: MilestoneMomentId;
  /** Line shown when the goal completes. */
  readonly doneText: string;
}

const branch = (...paths: LifeGoalPath[]): { readonly condition: ProgressionCondition; readonly paths: readonly LifeGoalPath[] } => ({
  condition: anyOf(...paths.map((path) => path.condition)),
  paths,
});

export const LIFE_GOALS = [
  // ===== Chapter 1 — Welcome to Lagos (first session; each takes minutes) =========================================
  {
    id: 'born-in-lagos',
    chapter: 1,
    order: 1,
    title: 'Born in Lagos',
    description: 'Fate dealt your cards. Welcome to the city of hustle.',
    hint: 'Already done — you’re here!',
    condition: always(),
    preCompleted: true,
    reward: { cash: 0, clout: 0 },
    celebration: 'toast',
    doneText: 'Fate don deal your cards. Now play them.',
  },
  {
    id: 'step-outside',
    chapter: 1,
    order: 2,
    title: 'Step outside',
    description: 'Leave the house and feel Lagos on your skin — the noise, the heat, the hawkers.',
    hint: 'Tap Exit (or press E at the door) to step out onto the street.',
    condition: count('outside'),
    reward: { cash: boosted(5_000), clout: 1 },
    celebration: 'toast',
    doneText: 'Lagos air don touch your body. Welcome to the streets!',
  },
  {
    id: 'get-a-ride',
    chapter: 1,
    order: 3,
    title: 'Get a ride',
    description: 'Buy your first car or jump on public transport. Lagos is too big to trek everywhere.',
    hint: 'Buy a car at Berger Car Mart (Ikeja) or Lekki Auto Gallery — or open Phone → Map and book a danfo, BRT or Bolt.',
    targetVenueTypes: ['car-dealer'],
    ...branch(
      {
        id: 'car',
        label: 'Own a car',
        hint: 'Berger Car Mart in Ikeja has Naija-used and tokunbo rides. Uncle Tunde’s money fit cover am.',
        condition: owns('car'),
        targetVenueTypes: ['car-dealer'],
      },
      {
        id: 'ride',
        label: 'Take a danfo, BRT, keke, okada or Bolt',
        hint: 'Open Phone → Map, pick any destination and book a ride. “Enter with your change!”',
        condition: anyOf(rode('danfo'), rode('brt'), rode('bolt'), rode('keke'), rode('okada')),
      },
    ),
    reward: { cash: boosted(10_000), clout: 2 },
    celebration: 'toast',
    doneText: 'You’re mobile now. Lagos just got smaller.',
  },
  {
    id: 'visit-cbt-centre',
    chapter: 1,
    order: 4,
    title: 'Visit a CBT centre',
    description: 'JAMB lives at the CBT centre. Go and see the place — server downtime and all.',
    hint: 'Drive or ride to Ikeja CBT Centre or Yaba CBT Centre (open 7:00–18:00).',
    targetVenueTypes: ['cbt-centre'],
    condition: visited('cbt-centre'),
    reward: { cash: boosted(10_000), clout: 2 },
    celebration: 'toast',
    doneText: 'You found the CBT centre. The generator is louder than the invigilator.',
  },
  {
    id: 'jamb-or-job',
    chapter: 1,
    order: 5,
    title: 'Register for JAMB — or take a job',
    description: 'Two roads: book your UTME at the CBT centre, or start earning now. Both are valid.',
    hint: 'At a CBT centre open Phone → School to register for JAMB — or open Phone → Jobs and apply for a hustle.',
    targetVenueTypes: ['cbt-centre'],
    ...branch(
      {
        id: 'jamb',
        label: 'Register for JAMB',
        hint: 'At Ikeja or Yaba CBT Centre, open Phone → School and pay the ₦7,200 UTME fee.',
        condition: anyOf({ kind: 'jamb-registered' }, { kind: 'admitted' }),
        targetVenueTypes: ['cbt-centre'],
      },
      {
        id: 'job',
        label: 'Take your first job',
        hint: 'Open Phone → Jobs. POS attendant, sales rep, Bolt driver — something dey for everybody.',
        condition: { kind: 'employed' },
      },
    ),
    reward: { cash: boosted(20_000), clout: 3 },
    celebration: 'toast',
    doneText: 'You don pick a road. Now waka am well.',
  },
  {
    id: 'eat-at-a-buka',
    chapter: 1,
    order: 6,
    title: 'Eat at a buka',
    description: 'Amala, gbegiri, ewedu and assorted meat. A Lagos rite of passage.',
    hint: 'Go to Shitta Amala Joint in Surulere and choose “Eat at the buka”.',
    targetVenueTypes: ['buka'],
    suggestedActionId: 'eat-buka',
    condition: did('eat-buka'),
    reward: { cash: boosted(5_000), clout: 1 },
    celebration: 'toast',
    doneText: 'Amala hot, ewedu drawing. You’re officially a Lagosian.',
  },
  {
    id: 'make-a-friend',
    chapter: 1,
    order: 7,
    title: 'Make a friend',
    description: 'Man know man. Your network is your net worth.',
    hint: 'Choose “Mingle” at a buka, lounge, campus, beach or church — or accept a friend request from another player.',
    targetVenueTypes: ['buka', 'bar', 'campus', 'beach', 'church', 'mosque'],
    suggestedActionId: 'meet-people',
    condition: anyOf(did('meet-people'), signalled('friend-added')),
    reward: { cash: boosted(5_000), clout: 2 },
    celebration: 'toast',
    doneText: 'New connection unlocked. Man know man!',
  },
  {
    id: 'visit-obo-mansion',
    chapter: 1,
    order: 8,
    title: 'Visit OBO Mansion',
    description: 'OBO’s mansion in Ikoyi is open to the public: a cinema, a studio, a games room — and a jet parked outside.',
    hint: 'Open Phone → Map and go to OBO Mansion in Ikoyi (open 8:00–22:00). Walk in and look around.',
    targetVenueTypes: ['mansion'],
    optional: true,
    condition: visited('mansion'),
    reward: { cash: boosted(5_000), clout: 1 },
    celebration: 'toast',
    doneText: 'Shekpe! You don enter OBO’s house.',
  },

  // ===== Chapter 2 — Finding your path ===========================================================================
  {
    id: 'write-jamb',
    chapter: 2,
    order: 1,
    title: 'Write JAMB',
    description: 'Sit the UTME. Shine your eye — 180 and above earns a bonus.',
    hint: 'Study at home for a few days, then write the exam at your CBT centre from Phone → School.',
    targetVenueTypes: ['cbt-centre'],
    optional: true,
    condition: { kind: 'jamb-written' },
    reward: { cash: boosted(15_000), clout: 2 },
    bonus: { label: 'Scored 180 or more', condition: { kind: 'jamb-score', atLeast: 180 }, cash: 25_000, clout: 3 },
    celebration: 'toast',
    doneText: 'JAMB don finish! Whatever the score, you sat it.',
  },
  {
    id: 'find-your-path',
    chapter: 2,
    order: 2,
    title: 'Find your path',
    description: 'University, a trade or tech — pick a lane and commit.',
    hint: 'Get admitted through Phone → School, practise a trade until Handiwork hits 30, or learn to code until Tech hits 30.',
    ...branch(
      {
        id: 'admitted',
        label: 'Get admitted',
        hint: 'Write JAMB, apply in Phone → School and accept your admission offer.',
        condition: { kind: 'admitted' },
        targetVenueTypes: ['campus'],
        milestone: 'admission',
      },
      {
        id: 'trade',
        label: 'Learn a trade (Handiwork 30)',
        hint: 'Choose “Practise a trade” at home, a market or a salon until Handiwork reaches 30.',
        condition: skill('trade', 30),
        targetVenueTypes: ['market', 'salon'],
        milestone: 'path-chosen',
      },
      {
        id: 'tech',
        label: 'Get your tech skill to 30',
        hint: 'Buy a laptop, then “Learn to code” at home or the Yaba Tech Hub until Tech reaches 30.',
        condition: skill('tech', 30),
        targetVenueTypes: ['office'],
        milestone: 'path-chosen',
      },
    ),
    reward: { cash: boosted(50_000), clout: 5 },
    celebration: 'moment',
    doneText: 'You don find your lane. Lagos rewards people who commit.',
  },
  {
    id: 'first-salary',
    chapter: 2,
    order: 3,
    title: 'First salary',
    description: 'Get paid for real work. The first alert hits different.',
    hint: 'Get a job in Phone → Jobs and show up — salary lands at the end of the month.',
    condition: count('salary-months'),
    reward: { cash: boosted(20_000), clout: 5 },
    celebration: 'moment',
    milestone: 'first-salary',
    doneText: 'Alert don land! Remember the people wey dey pray for you.',
  },
  {
    id: 'buy-a-laptop',
    chapter: 2,
    order: 4,
    title: 'Buy a laptop',
    description: 'Tech, freelancing, assignments — everything starts with a laptop.',
    hint: 'Computer Village in Ikeja has laptops for every budget. Shine your eye for “London used”.',
    targetVenueTypes: ['market', 'mall'],
    optional: true,
    condition: owns('laptop'),
    reward: { cash: boosted(15_000), clout: 2 },
    celebration: 'toast',
    doneText: 'Laptop secured. Your future self says thank you.',
  },
  {
    id: 'drivers-licence',
    chapter: 2,
    order: 5,
    title: 'Get your driver’s licence',
    description: 'No more “anything for the boys” at every checkpoint.',
    hint: 'Take the FRSC driving test at Alausa Secretariat in Ikeja (Phone → Motors).',
    targetVenueTypes: ['government'],
    optional: true,
    condition: certified('drivers-licence'),
    reward: { cash: boosted(10_000), clout: 3 },
    celebration: 'toast',
    doneText: 'Licensed and legal. Checkpoints can’t shake you now.',
  },
  {
    id: 'tour-dangote-refinery',
    chapter: 2,
    order: 6,
    title: 'Tour Dangote Refinery',
    description: 'Africa’s biggest refinery sits on the Lekki lagoon. See where Lagos petrol comes from.',
    hint: 'Ride or drive to Dangote Refinery (Epe & Ibeju-Lekki, open 8:00–17:00) and choose “Take the tour”.',
    targetVenueTypes: ['refinery'],
    suggestedActionId: 'refinery-tour',
    optional: true,
    condition: did('refinery-tour'),
    reward: { cash: boosted(10_000), clout: 2 },
    celebration: 'toast',
    doneText: 'Hard hat off. Now you know where the fuel queue starts.',
  },

  // ===== Chapter 3 — Building ===================================================================================
  {
    id: 'move-out',
    chapter: 3,
    order: 1,
    title: 'Move out of the family house',
    description: 'Your own key. Your own rules. Your own NEPA bill.',
    hint: 'Visit an estate agency (Ikoyi Realty, Lekki Homes & Land) or open Phone → Homes to rent a place.',
    targetVenueTypes: ['estate-agency'],
    condition: home(['rented', 'owned']),
    reward: { cash: boosted(50_000), clout: 8 },
    celebration: 'moment',
    milestone: 'moved-out',
    doneText: 'Your own key! Housewarming money from the family is on the way.',
  },
  {
    id: 'graduate-or-promotion',
    chapter: 3,
    order: 2,
    title: 'Graduate — or get promoted',
    description: 'Certificate in hand or a bigger title at work. Either way, levels have changed.',
    hint: 'Finish your programme (ASUU permitting) — or show up to work and request a promotion in Phone → Jobs.',
    ...branch(
      {
        id: 'graduate',
        label: 'Graduate',
        hint: 'Attend lectures, pay your fees and pass your exams. Convocation is waiting.',
        condition: { kind: 'degree' },
        targetVenueTypes: ['campus'],
        milestone: 'graduation',
      },
      {
        id: 'promotion',
        label: 'Get promoted',
        hint: 'Keep your attendance and mood up, then request a promotion in Phone → Jobs when you’re due.',
        condition: count('promotions'),
      },
    ),
    reward: { cash: boosted(100_000), clout: 10 },
    celebration: 'moment',
    doneText: 'Levels don change! Mama is telling the whole church.',
  },
  {
    id: 'save-a-million',
    chapter: 3,
    order: 3,
    title: 'Save ₦1M',
    description: 'Money in savings, not in your pocket where Sapa can see it.',
    hint: 'Open Phone → Bank and move money into savings. Interest is small; discipline is big.',
    condition: { kind: 'savings', atLeast: 1_000_000 },
    reward: { cash: boosted(50_000), clout: 5 },
    celebration: 'toast',
    doneText: 'One million in the bank. Sapa can’t find you here.',
  },
  {
    id: 'buy-land',
    chapter: 3,
    order: 4,
    title: 'Buy land',
    description: 'Land no dey spoil. Just make sure the C of O is real.',
    hint: 'Epe Land Bureau sells affordable plots; Ikoyi Realty if you’re feeling Odogwu. Check the title before you pay!',
    targetVenueTypes: ['estate-agency'],
    optional: true,
    condition: { kind: 'property-value', atLeast: 1 },
    reward: { cash: boosted(100_000), clout: 10 },
    celebration: 'moment',
    milestone: 'first-property',
    doneText: 'You own a piece of Lagos. Omonile, stay away!',
  },
  {
    id: 'first-romance',
    chapter: 3,
    order: 5,
    title: 'First romance',
    description: 'Somebody don catch your eye. Shoot your shot.',
    hint: 'Mingle at lounges, beaches and church. When you click with someone, ask them out from Phone → Family.',
    targetVenueTypes: ['bar', 'beach', 'church'],
    suggestedActionId: 'meet-people',
    optional: true,
    condition: relationship('dating', 'engaged', 'married'),
    reward: { cash: boosted(20_000), clout: 4 },
    celebration: 'toast',
    doneText: 'Butterflies and data subscriptions. Love is sweet!',
  },

  // ===== Chapter 4 — Legacy =====================================================================================
  {
    id: 'get-married',
    chapter: 4,
    order: 1,
    title: 'Get married',
    description: 'Introduction, traditional, white wedding — and the aso-ebi drama.',
    hint: 'When the relationship is strong, propose from Phone → Family, then plan the introduction and wedding.',
    targetVenueTypes: ['event-centre', 'church', 'mosque'],
    condition: relationship('married'),
    reward: { cash: boosted(200_000), clout: 15 },
    celebration: 'moment',
    milestone: 'wedding',
    doneText: 'Wedding bells! The families have become one big WhatsApp group.',
  },
  {
    id: 'first-child',
    chapter: 4,
    order: 2,
    title: 'Welcome your first child',
    description: 'Naming ceremony loading. Grandma has already chosen three names.',
    hint: 'Start a family from Phone → Family — and make sure you can afford a good hospital.',
    targetVenueTypes: ['hospital-private', 'hospital-public'],
    condition: children(1),
    reward: { cash: boosted(150_000), clout: 10 },
    celebration: 'moment',
    milestone: 'first-child',
    doneText: 'Omo tuntun! Sleep is now a rumour.',
  },
  {
    id: 'own-a-house',
    chapter: 4,
    order: 3,
    title: 'Own a house',
    description: 'No more landlord wahala. The house is yours.',
    hint: 'Buy land with a good title and build from Phone → Homes — or buy a finished house.',
    targetVenueTypes: ['estate-agency'],
    condition: home(['owned']),
    reward: { cash: boosted(200_000), clout: 15 },
    celebration: 'moment',
    milestone: 'first-property',
    doneText: 'Landlord! Now YOU get to complain about tenants.',
  },
  {
    id: 'big-man',
    chapter: 4,
    order: 4,
    title: 'Become a Big Man / Big Woman',
    description: 'Clout 450. When you enter, people stand up.',
    hint: 'Clout comes from career titles, degrees, your home, your ride, your drip and the parties you throw.',
    condition: status(450),
    reward: { cash: boosted(100_000), clout: 0 },
    celebration: 'moment',
    milestone: 'big-man',
    doneText: 'Big Man / Big Woman! The red carpet is rolling out.',
  },
  {
    id: 'heir-ready',
    chapter: 4,
    order: 5,
    title: 'Raise an heir',
    description: 'A child who is 17 and ready to carry the family name.',
    hint: 'Pay school fees and show up for your children — your heir takes over when your time comes.',
    after: ['first-child'],
    condition: children(1, 17),
    reward: { cash: boosted(150_000), clout: 10 },
    celebration: 'moment',
    doneText: 'Your heir is ready. The dynasty is secure.',
  },
] as const satisfies readonly LifeGoalDefinition[];

export type LifeGoalId = (typeof LIFE_GOALS)[number]['id'];

const GOAL_INDEX: ReadonlyMap<string, LifeGoalDefinition> = new Map(LIFE_GOALS.map((goal) => [goal.id, goal]));

export function findLifeGoal(id: string): LifeGoalDefinition | undefined {
  return GOAL_INDEX.get(id);
}

export function lifeGoalsInChapter(chapter: number): readonly LifeGoalDefinition[] {
  return LIFE_GOALS.filter((goal) => goal.chapter === chapter);
}

export function findLifeChapter(chapter: number): LifeChapterDefinition | undefined {
  return LIFE_CHAPTERS.find((definition) => definition.number === chapter);
}

/** Every naira all Life Goals can ever pay out (base + bonuses) must stay under this — they're nudges, not salaries. */
export const LIFE_GOAL_CASH_BUDGET = boosted(1_500_000);

// ----- Achievements ------------------------------------------------------------------------------------------------

export const ACHIEVEMENT_RARITY_IDS = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type AchievementRarity = (typeof ACHIEVEMENT_RARITY_IDS)[number];

export interface AchievementRarityDefinition {
  readonly id: AchievementRarity;
  readonly label: string;
  /** Permanent clout the badge adds (capped with all progression clout). */
  readonly clout: number;
}

export const ACHIEVEMENT_RARITIES: Readonly<Record<AchievementRarity, AchievementRarityDefinition>> = {
  common: { id: 'common', label: 'Common', clout: 1 },
  uncommon: { id: 'uncommon', label: 'Uncommon', clout: 2 },
  rare: { id: 'rare', label: 'Rare', clout: 4 },
  epic: { id: 'epic', label: 'Epic', clout: 7 },
  legendary: { id: 'legendary', label: 'Legendary', clout: 12 },
};

export const ACHIEVEMENT_CATEGORIES = ['city', 'food', 'social', 'health', 'school', 'work', 'money', 'home', 'love', 'status'] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export interface AchievementDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** lucide icon name. */
  readonly icon: string;
  readonly rarity: AchievementRarity;
  readonly category: AchievementCategory;
  /** Hidden until unlocked (title and description show as a teaser). */
  readonly secret?: boolean;
  readonly condition: ProgressionCondition;
  /** Full-screen moment the first time this unlocks. */
  readonly milestone?: MilestoneMomentId;
}

/** Shown in place of a locked secret achievement's description. */
export const SECRET_ACHIEVEMENT_TEASER = 'Secret achievement. Live your life — you’ll know it when it happens.';

export const ACHIEVEMENTS = [
  // ----- City ---------------------------------------------------------------------------------------------------
  { id: 'omo-lagos', title: 'Omo Lagos', description: 'Stepped out into the Lagos madness for the first time.', icon: 'footprints', rarity: 'common', category: 'city', condition: count('outside') },
  { id: 'enter-with-your-change', title: 'Enter with your change', description: 'Took your first danfo. The conductor still owes you ₦50.', icon: 'bus', rarity: 'common', category: 'city', condition: rode('danfo') },
  { id: 'conductor-favourite', title: 'Conductor’s favourite', description: '50 danfo rides. You shout “Oshodi! Oshodi!” in your sleep.', icon: 'bus-front', rarity: 'rare', category: 'city', condition: rode('danfo', 50) },
  { id: 'okada-survivor', title: 'Okada survivor', description: '10 okada rides and all your limbs are still where God put them.', icon: 'bike', rarity: 'uncommon', category: 'city', condition: rode('okada', 10) },
  { id: 'keke-chronicles', title: 'Keke chronicles', description: '10 keke rides squeezed between two aunties and a bag of pepper.', icon: 'car-taxi-front', rarity: 'uncommon', category: 'city', condition: rode('keke', 10) },
  { id: 'blue-bus-loyalist', title: 'Blue bus loyalist', description: '20 BRT rides. Orderly queues in Lagos — you’ve seen miracles.', icon: 'bus', rarity: 'uncommon', category: 'city', condition: rode('brt', 20) },
  { id: 'surge-pricing-victim', title: 'Surge pricing victim', description: 'Booked a Bolt in the rain. The fare said no. You said yes.', icon: 'cloud-rain', rarity: 'uncommon', category: 'city', condition: count(progressionCounter.rainTrip('bolt')) },
  { id: 'trekking-na-exercise', title: 'Trekking na exercise', description: 'Trekked to 10 destinations. Who needs a gym membership?', icon: 'footprints', rarity: 'uncommon', category: 'city', condition: rode('walk', 10) },
  { id: 'third-mainland-at-sunset', title: 'Third Mainland at sunset', description: 'Drove across the lagoon between 6 and 7pm. Golden water, golden you.', icon: 'sunset', rarity: 'rare', category: 'city', condition: count('bridge-sunset') },
  { id: 'island-mainland-commuter', title: 'Island–Mainland commuter', description: 'Crossed the lagoon 30 times. Your car knows the bridge by heart.', icon: 'route', rarity: 'rare', category: 'city', condition: count('lagoon-crossings', 30) },
  { id: 'go-slow-gladiator', title: 'Go-slow gladiator', description: 'Survived a 2-hour trip through Lagos traffic without losing your mind (mostly).', icon: 'snail', rarity: 'uncommon', category: 'city', condition: count('long-trips') },
  { id: 'gidi-explorer', title: 'Gidi explorer', description: 'Visited 10 different places in Lagos.', icon: 'map', rarity: 'uncommon', category: 'city', condition: count('venues', 10) },
  { id: 'eko-o-ni-baje', title: 'Eko o ni baje', description: 'Set foot in 12 Lagos districts. You know this city like your palm.', icon: 'map-pinned', rarity: 'epic', category: 'city', condition: count('districts', 12) },
  { id: 'interstate', title: 'Interstate', description: 'Left Lagos for another city: fly, or take the coach and mind the potholes on the expressway.', icon: 'map', rarity: 'uncommon', category: 'city', condition: count('cities') },
  { id: 'departure-lounge', title: 'Departure lounge', description: 'Visited the airport. Just looking. For now.', icon: 'plane', rarity: 'common', category: 'city', condition: visited('airport') },
  { id: 'server-don-down', title: 'Server don down', description: 'Visited a CBT centre. The generator was louder than the invigilator.', icon: 'monitor', rarity: 'common', category: 'city', condition: visited('cbt-centre') },
  { id: 'inside-obo-mansion', title: 'Inside OBO’s house', description: 'Walked into OBO Mansion in Ikoyi. Shekpe!', icon: 'castle', rarity: 'common', category: 'city', condition: count(progressionCounter.venue('obo-mansion')) },
  { id: 'movie-night-at-obos', title: 'Movie night at OBO’s', description: 'Watched a movie in OBO’s cinema. Recliner, popcorn, surround sound.', icon: 'clapperboard', rarity: 'uncommon', category: 'city', condition: anyOf(did('obo-movie'), did('obo-vip-screening')) },
  { id: 'winner-stays-on', title: 'Winner stays on', description: 'Played FIFA in OBO’s games room.', icon: 'gamepad-2', rarity: 'common', category: 'city', condition: did('obo-fifa') },
  { id: 'captain-on-deck', title: 'Captain on deck', description: 'Took a selfie in the AIR OBO cockpit. The jet stayed parked.', icon: 'plane', rarity: 'uncommon', category: 'city', condition: did('air-obo-selfie') },
  { id: 'peed-on-a-private-jet', title: 'Peed on a private jet', description: 'Used the toilet on AIR OBO. Gold taps and all.', icon: 'toilet', rarity: 'uncommon', category: 'city', condition: did('air-obo-toilet') },
  { id: 'where-petrol-comes-from', title: 'Where petrol comes from', description: 'Toured Dangote Refinery on the Lekki lagoon.', icon: 'factory', rarity: 'uncommon', category: 'city', condition: did('refinery-tour') },
  {
    id: 'e-choke',
    title: 'E choke!',
    description: 'At OBO’s: watched a movie, played FIFA, recorded a song, and took a selfie in the AIR OBO cockpit.',
    icon: 'sparkles',
    rarity: 'rare',
    category: 'city',
    condition: allOf(anyOf(did('obo-movie'), did('obo-vip-screening')), did('obo-fifa'), did('obo-record'), did('air-obo-selfie')),
  },
  { id: 'night-crawler', title: 'Night crawler', description: 'Out on the streets between 2am and 4am. Lagos never sleeps, and neither do you.', icon: 'moon', rarity: 'uncommon', category: 'city', secret: true, condition: count('street-late') },

  // ----- Food & lifestyle ---------------------------------------------------------------------------------------
  { id: 'buka-baptism', title: 'Buka baptism', description: 'First meal at a buka. Amala hot, ewedu drawing.', icon: 'soup', rarity: 'common', category: 'food', condition: did('eat-buka') },
  { id: 'mama-put-regular', title: 'Mama Put regular', description: '25 buka meals. They start dishing your order the moment you enter.', icon: 'cooking-pot', rarity: 'rare', category: 'food', condition: did('eat-buka', 25) },
  { id: 'chowdeck-champion', title: 'Chowdeck champion', description: '20 food deliveries. The riders know the colour of your gate.', icon: 'package', rarity: 'uncommon', category: 'food', condition: did('order-food', 20) },
  { id: 'iron-stomach', title: 'Iron stomach', description: '15 roadside meals. Your stomach has seen things.', icon: 'utensils', rarity: 'uncommon', category: 'food', condition: did('street-food', 15) },
  { id: 'mamas-pot', title: 'Mama’s pot', description: 'Cooked 20 pots of stew. Mama would be proud (she’ll still add salt).', icon: 'chef-hat', rarity: 'uncommon', category: 'food', condition: did('cook', 20) },
  { id: 'jollof-deconstructed', title: 'Jollof deconstructed', description: 'Had a fine-dining experience. ₦75k for three spoons of rice.', icon: 'wine', rarity: 'uncommon', category: 'food', condition: did('fine-dining') },
  { id: 'soft-life-activated', title: 'Soft life activated', description: 'Living the soft life (or better). Brunch is now a personality.', icon: 'sparkles', rarity: 'rare', category: 'food', condition: { kind: 'lifestyle', in: ['soft-life', 'odogwu'] } },
  { id: 'garri-and-sugar', title: 'Garri and sugar', description: 'Born above Sapa, yet Sapa still found you. It happens to the best of us.', icon: 'frown', rarity: 'uncommon', category: 'food', secret: true, condition: allOf(background('working-class', 'ajebota', 'nepo-baby'), { kind: 'lifestyle', in: ['sapa'] }) },

  // ----- Social -------------------------------------------------------------------------------------------------
  { id: 'man-know-man', title: 'Man know man', description: 'Made your first connection. Your network is your net worth.', icon: 'handshake', rarity: 'common', category: 'social', condition: anyOf(did('meet-people'), signalled('friend-added')) },
  { id: 'life-of-the-party', title: 'Life of the party', description: 'Mingled 25 times. Everybody knows your name.', icon: 'users', rarity: 'rare', category: 'social', condition: anyOf(did('meet-people', 25), signalled('friend-added', 10)) },
  { id: 'dj-knows-your-name', title: 'The DJ knows your name', description: 'Turned up at the club. Sparklers, bottles, no regrets (yet).', icon: 'disc-3', rarity: 'uncommon', category: 'social', condition: did('club-night') },
  { id: 'detty-december-certified', title: 'Detty December certified', description: 'Hit the club in Detty December. January will be long.', icon: 'party-popper', rarity: 'rare', category: 'social', condition: count('detty-club') },
  { id: 'elegushi-vibes', title: 'Elegushi vibes', description: '5 beach hangouts. Suya, horses and loud speakers.', icon: 'tree-palm', rarity: 'uncommon', category: 'social', condition: did('beach-day', 5) },
  { id: 'nollywood-critic', title: 'Nollywood critic', description: 'Watched 5 movies at the cinema. You have opinions about the sequel.', icon: 'clapperboard', rarity: 'uncommon', category: 'social', condition: did('cinema', 5) },
  { id: 'sprayed-at-an-owambe', title: 'Sprayed at an owambe', description: 'Rained naira on the dance floor. EFCC is typing…', icon: 'banknote', rarity: 'uncommon', category: 'social', condition: signalled('owambe-sprayed') },
  { id: 'money-rain', title: 'Money rain', description: 'Sprayed ₦1,000,000 in total at owambes. The DJ named a song after you.', icon: 'hand-coins', rarity: 'epic', category: 'social', secret: true, condition: count(progressionCounter.signalTotal('owambe-sprayed'), 1_000_000) },
  { id: 'party-of-the-year', title: 'Party of the year', description: 'Hosted an owambe. Small chops, jollof and plenty gist.', icon: 'party-popper', rarity: 'rare', category: 'social', condition: signalled('owambe-hosted') },
  { id: 'owambe-regular', title: 'Owambe regular', description: 'Attended 10 owambes. Your aso-ebi collection needs its own room.', icon: 'shirt', rarity: 'rare', category: 'social', condition: signalled('owambe-attended', 10) },
  { id: 'skit-maker', title: 'Skit maker', description: 'Made content 20 times. The algorithm has noticed you.', icon: 'video', rarity: 'uncommon', category: 'social', condition: did('make-content', 20) },
  { id: 'front-row-worshipper', title: 'Front row worshipper', description: 'Attended service 10 times. The usher knows your seat.', icon: 'church', rarity: 'uncommon', category: 'social', condition: did('worship', 10) },
  { id: 'mummys-favourite', title: 'Mummy’s favourite', description: 'Called family 10 times. Mummy asked about marriage 10 times.', icon: 'phone', rarity: 'common', category: 'social', condition: did('call-family', 10) },
  { id: 'doom-scroller', title: 'Doom scroller', description: 'Scrolled social media 50 times. Your screen-time report is embarrassing.', icon: 'smartphone', rarity: 'uncommon', category: 'social', secret: true, condition: did('scroll', 50) },
  { id: 'family-atm', title: 'Family ATM', description: 'Answered black tax 10 times. Blood is thicker than your bank balance.', icon: 'wallet', rarity: 'rare', category: 'social', condition: signalled('black-tax-paid', 10) },
  { id: 'anything-for-the-boys', title: 'Anything for the boys?', description: 'Made it through a police checkpoint. “Oga, we dey go.”', icon: 'siren', rarity: 'uncommon', category: 'social', condition: signalled('checkpoint-survived') },

  // ----- Health & body ------------------------------------------------------------------------------------------
  { id: 'leg-day-survivor', title: 'Leg day survivor', description: '30 gym sessions. You now say “gains” unironically.', icon: 'dumbbell', rarity: 'rare', category: 'health', condition: did('gym', 30) },
  { id: 'six-pack-loading', title: 'Six-pack loading', description: 'Reached fitness 80. Agbada now fits like a glove.', icon: 'flame', rarity: 'rare', category: 'health', condition: { kind: 'fitness', atLeast: 80 } },
  { id: 'paracetamol-and-prayers', title: 'Paracetamol and prayers', description: 'Saw a doctor or pharmacist. Self-medication has limits.', icon: 'stethoscope', rarity: 'common', category: 'health', condition: did('treatment') },
  { id: 'malaria-warrior', title: 'Malaria warrior', description: 'Caught malaria and lived to tell the tale. Mosquito net: purchased.', icon: 'bug', rarity: 'uncommon', category: 'health', condition: allOf(count(progressionCounter.had('malaria')), { kind: 'not-ill', conditionId: 'malaria' }) },
  { id: 'na-the-street-food', title: 'Na the street food', description: 'Survived typhoid. You and that roadside jollof need to talk.', icon: 'pill', rarity: 'uncommon', category: 'health', secret: true, condition: allOf(count(progressionCounter.had('typhoid')), { kind: 'not-ill', conditionId: 'typhoid' }) },
  { id: 'adulting', title: 'Adulting', description: 'Turned 18. Now you can be disappointed by voter registration.', icon: 'cake', rarity: 'common', category: 'health', condition: { kind: 'age', atLeast: 18 } },
  { id: 'baba-agba', title: 'Baba / Mama Agba', description: 'Reached 60. Respect your elders — that’s you now.', icon: 'hourglass', rarity: 'epic', category: 'health', condition: { kind: 'age', atLeast: 60 } },

  // ----- School -------------------------------------------------------------------------------------------------
  { id: 'utme-candidate', title: 'UTME candidate', description: 'Registered for JAMB. Now read your books.', icon: 'notebook-pen', rarity: 'common', category: 'school', condition: anyOf({ kind: 'jamb-registered' }, { kind: 'admitted' }) },
  { id: 'two-hundred-club', title: '200 club', description: 'Scored 200+ in JAMB. Your parents are telling the whole street.', icon: 'star', rarity: 'uncommon', category: 'school', condition: { kind: 'jamb-score', atLeast: 200 } },
  { id: 'jamb-topper', title: 'JAMB topper', description: 'Scored 300+ in JAMB. Newspapers want an interview.', icon: 'trophy', rarity: 'epic', category: 'school', condition: { kind: 'jamb-score', atLeast: 300 } },
  { id: 'admission-letter', title: 'Admission letter', description: 'Got admitted. The real struggle begins.', icon: 'mail-open', rarity: 'uncommon', category: 'school', condition: { kind: 'admitted' }, milestone: 'admission' },
  { id: 'survived-asuu', title: 'Survived ASUU', description: 'Stayed enrolled through an ASUU strike. Patience level: professor.', icon: 'hourglass', rarity: 'rare', category: 'school', condition: count('strike-days') },
  { id: 'asuu-veteran', title: 'ASUU veteran', description: 'Endured 90+ days of ASUU strikes. Your four-year course is now a lifestyle.', icon: 'calendar-x', rarity: 'epic', category: 'school', secret: true, condition: count('strike-days', 90) },
  { id: 'graduate', title: 'Graduate', description: 'Earned your first degree or diploma. Convocation photos loading.', icon: 'graduation-cap', rarity: 'rare', category: 'school', condition: { kind: 'degree' }, milestone: 'graduation' },
  { id: 'first-class', title: 'First class', description: 'Graduated with a First (or Distinction). Lecturers actually remember your name.', icon: 'award', rarity: 'epic', category: 'school', condition: { kind: 'degree', grades: ['first', 'distinction'] } },
  { id: 'corper-wee', title: 'Corper wee!', description: 'Completed NYSC. You survived the camp, the khaki and the PPA.', icon: 'shield-check', rarity: 'rare', category: 'school', condition: { kind: 'nysc-completed' } },
  { id: 'japa-dreams', title: 'Japa dreams', description: 'Passed IELTS. Canada, UK, Germany — the world is calling.', icon: 'plane-takeoff', rarity: 'rare', category: 'school', condition: certified('ielts') },
  { id: 'akowe', title: 'Akowe', description: 'Book sense 70+. You correct people’s grammar at parties.', icon: 'brain', rarity: 'rare', category: 'school', condition: skill('intellect', 70) },
  { id: 'licensed-to-drive', title: 'Licensed to drive', description: 'Got your FRSC licence. Checkpoints can’t shake you.', icon: 'id-card', rarity: 'common', category: 'school', condition: certified('drivers-licence') },
  { id: 'letters-after-your-name', title: 'Letters after your name', description: 'Professional licence earned: BL, MDCN, ACA, COREN or NMCN.', icon: 'scale', rarity: 'epic', category: 'school', condition: certified('bar', 'mdcn', 'ican', 'coren', 'nmcn') },
  { id: 'sapa-graduate', title: 'Sapa graduate', description: 'Born a Sapa Pikin, graduated anyway. Mama is crying happy tears in Mushin.', icon: 'graduation-cap', rarity: 'epic', category: 'school', condition: allOf(background('sapa-pikin'), { kind: 'degree' }) },

  // ----- Work ---------------------------------------------------------------------------------------------------
  { id: 'employed', title: 'Employed!', description: 'Got your first job. Monday is now your enemy.', icon: 'briefcase', rarity: 'common', category: 'work', condition: { kind: 'employed' } },
  { id: 'alert-don-land', title: 'Alert don land', description: 'Received your first salary. You screenshotted the alert.', icon: 'banknote', rarity: 'uncommon', category: 'work', condition: count('salary-months'), milestone: 'first-salary' },
  { id: 'oga-in-training', title: 'Oga in training', description: 'Got your first promotion. New title, same traffic.', icon: 'trending-up', rarity: 'rare', category: 'work', condition: count('promotions') },
  { id: 'nepo-who-worked', title: 'Nepo who worked', description: 'A Nepo Baby with an actual job. Daddy’s friends are confused.', icon: 'briefcase-business', rarity: 'rare', category: 'work', condition: allOf(background('nepo-baby'), { kind: 'employed' }) },
  { id: 'tech-bro', title: 'Tech bro (or sis)', description: 'Tech skill 60+. You say “let’s circle back” in the family WhatsApp group.', icon: 'code-xml', rarity: 'rare', category: 'work', condition: skill('tech', 60) },
  { id: 'street-smarts', title: 'Street smarts', description: 'Hustle 60+. You could sell sand in the Sahara.', icon: 'zap', rarity: 'rare', category: 'work', condition: skill('hustle', 60) },
  { id: 'master-craftsman', title: 'Master craftsman', description: 'Handiwork 60+. People book you three weeks ahead.', icon: 'hammer', rarity: 'rare', category: 'work', condition: skill('trade', 60) },
  { id: 'freelance-warrior', title: 'Freelance warrior', description: 'Completed 10 freelance gigs. “Kindly revert” haunts your dreams.', icon: 'laptop', rarity: 'uncommon', category: 'work', condition: did('freelance', 10) },
  { id: 'ceo-of-my-life', title: 'CEO of my own life', description: 'Own a business. You’re the MD, the CEO and the cleaner.', icon: 'store', rarity: 'rare', category: 'work', condition: owns('business') },
  { id: 'seven-figure-salary', title: 'Seven-figure salary', description: 'Earn ₦1,000,000+ a month from your job.', icon: 'gem', rarity: 'epic', category: 'work', condition: { kind: 'monthly-pay', atLeast: 1_000_000 } },

  // ----- Money --------------------------------------------------------------------------------------------------
  { id: 'first-million', title: 'First million (self-made)', description: 'Earned ₦1M by your own hand. No Uncle Tunde in this figure.', icon: 'coins', rarity: 'uncommon', category: 'money', condition: earned(1_000_000) },
  { id: 'eight-figures', title: 'Eight figures', description: '₦10M earned, self-made. The family WhatsApp group has noticed.', icon: 'piggy-bank', rarity: 'rare', category: 'money', condition: earned(10_000_000) },
  { id: 'no-uncle-tunde-needed', title: 'No Uncle Tunde needed', description: '₦100M earned, self-made. Uncle Tunde is asking YOU for money now.', icon: 'gem', rarity: 'epic', category: 'money', condition: earned(100_000_000) },
  { id: 'self-made-billionaire', title: 'Self-made billionaire', description: '₦1B earned with your own hands. Forbes Africa, your call.', icon: 'crown', rarity: 'legendary', category: 'money', condition: earned(1_000_000_000) },
  { id: 'ajo-master', title: 'Ajo master', description: '₦1M sitting in savings. Sapa can’t find it.', icon: 'piggy-bank', rarity: 'uncommon', category: 'money', condition: { kind: 'savings', atLeast: 1_000_000 } },
  { id: 'rainy-day-fund', title: 'Rainy day fund', description: '₦50M in savings. Even NEPA can’t shake you.', icon: 'umbrella', rarity: 'epic', category: 'money', condition: { kind: 'savings', atLeast: 50_000_000 } },

  // ----- Home & property ----------------------------------------------------------------------------------------
  { id: 'independence-day', title: 'Independence day', description: 'Moved out of the family house. Your own key, your own NEPA bill.', icon: 'key-round', rarity: 'uncommon', category: 'home', condition: home(['rented', 'owned']), milestone: 'moved-out' },
  { id: 'omonile-cant-touch-you', title: 'Omonile can’t touch you', description: 'Own land or property. Hopefully the C of O is real.', icon: 'landmark', rarity: 'rare', category: 'home', condition: { kind: 'property-value', atLeast: 1 }, milestone: 'first-property' },
  { id: 'landlord', title: 'Landlord', description: 'Own the house you live in. Now YOU complain about tenants.', icon: 'house', rarity: 'epic', category: 'home', condition: home(['owned']), milestone: 'first-property' },
  { id: 'property-mogul', title: 'Property mogul', description: 'Property worth ₦500M or more. Banana Island is calling.', icon: 'building-2', rarity: 'legendary', category: 'home', condition: { kind: 'property-value', atLeast: 500_000_000 } },
  { id: 'nepa-who', title: 'NEPA who?', description: 'Own a generator, inverter or solar. Light is a lifestyle.', icon: 'plug-zap', rarity: 'uncommon', category: 'home', condition: { kind: 'power-backup' } },
  { id: 'first-whip', title: 'First whip', description: 'Own a car. Time to learn which roads flood.', icon: 'car', rarity: 'common', category: 'home', condition: owns('car'), milestone: 'first-car' },
  { id: 'island-living', title: 'Island living', description: 'Rent or own a home in Ikoyi, VI, Lekki or Banana Island.', icon: 'building', rarity: 'rare', category: 'home', condition: home(['rented', 'owned'], ['ikoyi', 'victoria-island', 'lekki', 'banana-island']) },
  { id: 'banana-island-resident', title: 'Banana Island resident', description: 'Live on Banana Island. Your neighbours have helipads.', icon: 'crown', rarity: 'legendary', category: 'home', secret: true, condition: home(['rented', 'owned'], ['banana-island']) },

  // ----- Love & family ------------------------------------------------------------------------------------------
  { id: 'toasting-season', title: 'Toasting season', description: 'Started your first relationship. Butterflies and data subscriptions.', icon: 'heart', rarity: 'common', category: 'love', condition: relationship('dating', 'engaged', 'married') },
  { id: 'put-a-ring-on-it', title: 'Put a ring on it', description: 'Got engaged. Introduction meeting loading…', icon: 'gem', rarity: 'uncommon', category: 'love', condition: relationship('engaged', 'married') },
  { id: 'wedding-bells', title: 'Wedding bells', description: 'Got married. The aso-ebi drama is finally over.', icon: 'heart-handshake', rarity: 'rare', category: 'love', condition: relationship('married'), milestone: 'wedding' },
  { id: 'omo-tuntun', title: 'Omo tuntun', description: 'Welcomed your first child. Sleep is now a rumour.', icon: 'baby', rarity: 'rare', category: 'love', condition: children(1), milestone: 'first-child' },
  { id: 'full-house', title: 'Full house', description: 'Four or more children. School fees warrior.', icon: 'users', rarity: 'epic', category: 'love', condition: children(4) },
  { id: 'heir-apparent', title: 'Heir apparent', description: 'A child of 17+ ready to carry the family name.', icon: 'crown', rarity: 'epic', category: 'love', condition: children(1, 17) },
  { id: 'the-heir-has-arrived', title: 'The heir has arrived', description: 'Playing as an heir. Big shoes to fill.', icon: 'scroll-text', rarity: 'rare', category: 'love', condition: { kind: 'generation', atLeast: 2 } },
  { id: 'dynasty', title: 'Dynasty', description: 'Third generation and counting. Your family name rings bells.', icon: 'castle', rarity: 'legendary', category: 'love', condition: { kind: 'generation', atLeast: 3 } },

  // ----- Status -------------------------------------------------------------------------------------------------
  { id: 'known-in-the-area', title: 'Known in the area', description: 'Clout 100. Area boys greet you by name.', icon: 'megaphone', rarity: 'common', category: 'status', condition: status(100) },
  { id: 'respected', title: 'Respected', description: 'Clout 250. People say “Sir” or “Ma” — and mean it.', icon: 'medal', rarity: 'uncommon', category: 'status', condition: status(250) },
  { id: 'big-man-big-woman', title: 'Big Man / Big Woman', description: 'Clout 450. When you enter, people stand up.', icon: 'badge-check', rarity: 'rare', category: 'status', condition: status(450), milestone: 'big-man' },
  { id: 'odogwu', title: 'Odogwu', description: 'Clout 700. All of Lagos knows your name.', icon: 'flame', rarity: 'epic', category: 'status', condition: status(700) },
  { id: 'lagos-royalty', title: 'Lagos Royalty', description: 'Clout 900. They roll out the red carpet when you arrive.', icon: 'crown', rarity: 'legendary', category: 'status', condition: status(900) },
  { id: 'from-mushin-to-the-top', title: 'From Mushin to the top', description: 'Born a Sapa Pikin, now a Big Man/Big Woman. Respect.', icon: 'trophy', rarity: 'legendary', category: 'status', secret: true, condition: allOf(background('sapa-pikin'), status(450)) },
  { id: 'humble-yourself', title: 'Humble yourself', description: 'A Nepo Baby who took a danfo. Character development.', icon: 'bus', rarity: 'uncommon', category: 'status', secret: true, condition: allOf(background('nepo-baby'), rode('danfo')) },
  { id: 'mamas-sunday-rice', title: 'Mama’s Sunday rice', description: 'Came home for Sunday rice. Nothing beats Mama’s jollof.', icon: 'cooking-pot', rarity: 'common', category: 'status', condition: count('welcome-sunday') },
] as const satisfies readonly AchievementDefinition[];

export type AchievementId = (typeof ACHIEVEMENTS)[number]['id'];

const ACHIEVEMENT_INDEX: ReadonlyMap<string, AchievementDefinition> = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));

export function findAchievement(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENT_INDEX.get(id);
}

/** Permanent clout from goals and badges is capped so status still has to be earned through life itself. */
export const PROGRESSION_CLOUT_CAP = 150;

// ----- Daily welcome -----------------------------------------------------------------------------------------------

/**
 * Once per real Lagos calendar day: a small mood boost and a little cash from home. Flavour rotates by weekday.
 * Never streak-based — missing a day costs nothing.
 */
export interface DailyWelcomeFlavour {
  readonly id: string;
  /** Real-world weekday in Africa/Lagos, 0 = Sunday … 6 = Saturday. */
  readonly weekday: number;
  readonly title: string;
  readonly body: string;
  readonly emoji: string;
  /** lucide icon name. */
  readonly icon: string;
  /** Mood modifier value while it lasts. */
  readonly mood: number;
  readonly minCash: number;
  readonly maxCash: number;
}

export const DAILY_WELCOME_MAX_CASH = 20_000;
/** How long the welcome's mood boost lasts (game minutes; one game day ≈ 12 real minutes). */
export const DAILY_WELCOME_MOOD_MINUTES = 2 * MINUTES_PER_DAY;

export const DAILY_WELCOME_FLAVOURS = [
  {
    id: 'mamas-sunday-rice',
    weekday: 0,
    title: 'Mama’s Sunday rice',
    body: 'Jollof, fried plantain and two pieces of chicken. Mama even packed extra “for your friend”.',
    emoji: '🍛',
    icon: 'cooking-pot',
    mood: 10,
    minCash: 10_000,
    maxCash: 20_000,
  },
  {
    id: 'papas-monday-pep-talk',
    weekday: 1,
    title: 'Papa’s Monday pep talk',
    body: '“Go out there and make us proud.” He pressed some transport money into your palm.',
    emoji: '👨🏾‍🦳',
    icon: 'hand-coins',
    mood: 6,
    minCash: 5_000,
    maxCash: 15_000,
  },
  {
    id: 'aunty-bisis-moi-moi',
    weekday: 2,
    title: 'Aunty Bisi’s moi-moi',
    body: 'Seven-lives moi-moi — egg, fish and corned beef. Aunty Bisi doesn’t play.',
    emoji: '🫘',
    icon: 'soup',
    mood: 7,
    minCash: 5_000,
    maxCash: 12_000,
  },
  {
    id: 'midweek-suya',
    weekday: 3,
    title: 'Midweek suya',
    body: 'Mallam Sule threw in extra yaji and onions because you greeted well.',
    emoji: '🍢',
    icon: 'flame',
    mood: 7,
    minCash: 5_000,
    maxCash: 12_000,
  },
  {
    id: 'grandmas-prayer-call',
    weekday: 4,
    title: 'Grandma’s prayer call',
    body: 'Twenty minutes of prayers on speakerphone, then “I sent something small.” You feel unstoppable.',
    emoji: '🙏🏾',
    icon: 'phone',
    mood: 8,
    minCash: 5_000,
    maxCash: 12_000,
  },
  {
    id: 'friday-small-chops',
    weekday: 5,
    title: 'Friday small chops',
    body: 'Puff-puff, samosa and spring rolls from the party next door. TGIF!',
    emoji: '🥟',
    icon: 'party-popper',
    mood: 8,
    minCash: 5_000,
    maxCash: 15_000,
  },
  {
    id: 'owambe-takeaway-pack',
    weekday: 6,
    title: 'Owambe takeaway pack',
    body: 'Your cousin’s wedding sent jollof home in a cooler — with a small envelope taped to the lid.',
    emoji: '🎉',
    icon: 'gift',
    mood: 9,
    minCash: 8_000,
    maxCash: 20_000,
  },
] as const satisfies readonly DailyWelcomeFlavour[];

export function dailyWelcomeFlavourFor(weekday: number): DailyWelcomeFlavour {
  const normalised = ((Math.trunc(weekday) % 7) + 7) % 7;
  return DAILY_WELCOME_FLAVOURS.find((flavour) => flavour.weekday === normalised) ?? DAILY_WELCOME_FLAVOURS[0];
}
