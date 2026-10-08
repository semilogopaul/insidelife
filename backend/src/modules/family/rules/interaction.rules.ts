import {
  MINUTES_PER_HOUR,
  RELATIONSHIP_KIND_LABELS,
  TRAITS,
  WEDDING_TIERS,
  formatGameDuration,
  isFamilyKind,
  type Gender,
  type InteractionDefinition,
  type PersonTrait,
  type RelationshipKind,
  type VenueType,
} from '@insidelife/shared';

/** Why an interaction can't happen right now (player-facing). */
export interface InteractionBlock {
  readonly code: string;
  readonly message: string;
}

/** Everything the requirement check needs, gathered by the service. */
export interface InteractionState {
  readonly kind: RelationshipKind;
  readonly name: string;
  readonly alive: boolean;
  readonly isPlayer: boolean;
  readonly closeness: number;
  readonly romance: number;
  readonly selfAge: number;
  readonly otherAge: number;
  readonly selfGender: Gender;
  readonly otherGender: Gender;
  /** Whole game days since you started dating (0 if not dating). */
  readonly datingDays: number;
  /** Venue type where you are now (null at home or on the street). */
  readonly venueType: VenueType | null;
  /** For players: they are at the same place as you. */
  readonly together: boolean;
  /** Game minute when this interaction is available again (null = no cooldown). */
  readonly cooldownUntil: number | null;
  readonly now: number;
  /** You already have a partner, fiancé(e) or spouse other than this person (or a pending romantic proposal). */
  readonly committedElsewhere: boolean;
  readonly introductionDone: boolean;
  readonly traditionalDone: boolean;
  readonly whiteWeddingDone: boolean;
  /** Either of you is already expecting. */
  readonly expecting: boolean;
  readonly amount?: number;
  readonly tier?: string;
}

/** Oldest age at which the woman in a couple can conceive in-game. */
export const MAX_FERTILE_AGE = 49;

const block = (code: string, message: string): InteractionBlock => ({ code, message });

function kindMessage(definition: InteractionDefinition, state: InteractionState): string {
  const relation = RELATIONSHIP_KIND_LABELS[state.kind].toLowerCase();
  switch (definition.id) {
    case 'ask-out':
      return isFamilyKind(state.kind) ? 'Ah ah! That’s family.' : `You’re already ${relation === 'ex' ? 'exes' : `each other’s ${relation}`}.`;
    case 'date':
      return `Ask ${state.name} out first.`;
    case 'propose':
      return `You can only propose to someone you’re dating.`;
    case 'introduction':
    case 'traditional-wedding':
    case 'white-wedding':
      return `Get engaged to ${state.name} first.`;
    case 'break-up':
      return `You’re not dating ${state.name}.`;
    case 'divorce':
      return `You’re not married to ${state.name}.`;
    case 'try-for-baby':
      return `You need to be in a relationship with ${state.name} for that.`;
    default:
      return isFamilyKind(state.kind) ? 'Ah ah! That’s family.' : `You can’t ${definition.label.toLowerCase()} with your ${relation}.`;
  }
}

/** Requirement check for an interaction. Returns null when allowed. Pure and deterministic. */
export function checkInteraction(definition: InteractionDefinition, state: InteractionState): InteractionBlock | null {
  if (!state.alive) return block('DECEASED', `${state.name} has passed on. May they rest in peace.`);
  if (!definition.kinds.includes(state.kind)) return block('NOT_ALLOWED', kindMessage(definition, state));
  if (definition.romantic && (state.selfAge < 18 || state.otherAge < 18)) {
    return block('TOO_YOUNG', 'Romance is for 18+. Face your books.');
  }
  if (state.cooldownUntil !== null && state.cooldownUntil > state.now) {
    return block('COOLDOWN', `Give it some time — try again in ${formatGameDuration(state.cooldownUntil - state.now)}.`);
  }
  if (definition.minCloseness !== undefined && state.closeness < definition.minCloseness) {
    return block('NOT_CLOSE_ENOUGH', `You and ${state.name} aren’t that close yet (closeness ${Math.round(state.closeness)}/${definition.minCloseness}).`);
  }
  if (definition.minRomance !== undefined && state.romance < definition.minRomance) {
    return block('NO_SPARK', `There isn’t enough spark yet (romance ${Math.round(state.romance)}/${definition.minRomance}).`);
  }
  if (definition.minDatingDays !== undefined && state.datingDays < definition.minDatingDays) {
    return block(
      'TOO_SOON',
      `You’ve only been dating for ${state.datingDays} day${state.datingDays === 1 ? '' : 's'}. Mummy said take it slow (${definition.minDatingDays}+ days).`,
    );
  }
  if (definition.venueTypes) {
    if (!state.venueType || !definition.venueTypes.includes(state.venueType)) {
      return block('WRONG_PLACE', 'Go somewhere nice first — a restaurant, lounge, cinema, beach or park.');
    }
  }
  if (state.isPlayer && (definition.id === 'hang-out' || definition.id === 'date') && !state.together) {
    return block('NOT_TOGETHER', `${state.name} isn’t here with you. Meet up at the same place first.`);
  }
  if ((definition.id === 'ask-out' || definition.id === 'propose') && state.committedElsewhere) {
    return block('ALREADY_TAKEN', 'You’re already with someone. Lagos is small o — finish that first.');
  }
  if (definition.needsAmount) {
    const { min, max } = definition.needsAmount;
    if (state.amount === undefined || !Number.isInteger(state.amount) || state.amount < min || state.amount > max) {
      return block('INVALID_AMOUNT', `Choose an amount between ₦${min.toLocaleString('en-NG')} and ₦${max.toLocaleString('en-NG')}.`);
    }
  }
  if (definition.needsTier && !(WEDDING_TIERS as readonly string[]).includes(state.tier ?? '')) {
    return block('INVALID_TIER', `Pick a wedding tier: ${WEDDING_TIERS.join(', ')}.`);
  }
  switch (definition.id) {
    case 'introduction':
      if (state.introductionDone) return block('ALREADY_DONE', 'The families have already been introduced.');
      break;
    case 'traditional-wedding':
      if (!state.introductionDone) return block('INTRODUCTION_FIRST', 'Do the introduction first — the families must meet.');
      if (state.traditionalDone) return block('ALREADY_DONE', 'You’ve already done the traditional wedding.');
      break;
    case 'white-wedding':
      if (state.whiteWeddingDone) return block('ALREADY_DONE', 'You’ve already had your white wedding.');
      break;
    case 'try-for-baby': {
      if (state.selfGender === state.otherGender) return block('BIOLOGY', 'Biology says no. Adoption is coming in a future update.');
      const womanAge = state.selfGender === 'female' ? state.selfAge : state.otherAge;
      if (womanAge > MAX_FERTILE_AGE) return block('FERTILITY', 'That ship has sailed — enjoy the grandchildren instead.');
      if (state.expecting) return block('ALREADY_EXPECTING', 'There’s already a baby on the way!');
      break;
    }
    default:
      break;
  }
  return null;
}

export interface AcceptanceInput {
  readonly closeness: number;
  readonly romance: number;
  /** Your charisma skill 0-100. */
  readonly charisma: number;
  /** Your clout 0-1000. */
  readonly status: number;
  readonly traits: readonly PersonTrait[];
  /** NPC is single and looking. */
  readonly available: boolean;
  /** Ring value (₦) for proposals. */
  readonly ringValue?: number;
}

/** Odds the NPC says yes: closeness, chemistry, your charm and clout, their personality. Clamped to 5-95%. */
export function acceptanceChance(definition: InteractionDefinition, input: AcceptanceInput): number {
  if (definition.odds === undefined) return 1;
  if (!input.available && (definition.id === 'ask-out' || definition.id === 'propose')) return 0;
  let chance =
    definition.odds +
    (input.closeness - 50) / 250 +
    (input.romance - 50) / 200 +
    (input.charisma - 20) / 400 +
    Math.min(0.1, Math.max(0, input.status) / 5_000);
  for (const trait of input.traits) chance += TRAITS[trait].acceptance[definition.id] ?? 0;
  if (definition.id === 'propose' && input.ringValue) chance += 0.08 * Math.log10(Math.max(1, input.ringValue / 150_000));
  if (!input.available && definition.id === 'flirt') chance -= 0.3;
  return Math.max(0.05, Math.min(0.95, chance));
}

/** Chance a try for a baby succeeds, by the woman's age. */
export function fertility(womanAge: number): number {
  if (womanAge > MAX_FERTILE_AGE) return 0;
  if (womanAge < 30) return 1;
  if (womanAge < 35) return 0.8;
  if (womanAge < 40) return 0.55;
  if (womanAge < 45) return 0.25;
  return 0.08;
}

/** Cooldown end for an interaction started at `now`. */
export function cooldownEnd(definition: InteractionDefinition, now: number): number | null {
  return definition.cooldownHours > 0 ? now + definition.cooldownHours * MINUTES_PER_HOUR : null;
}

/** Closeness from a gift: diminishing returns on how far it beats what they expect from someone like you (1-15). */
export function giftCloseness(amount: number, expectation: number): number {
  const ratio = Math.max(0, amount) / Math.max(1, expectation);
  return Math.max(1, Math.min(15, Math.round(5 * Math.log2(1 + ratio))));
}
