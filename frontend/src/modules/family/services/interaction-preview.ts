import {
  DATE_COSTS,
  DATE_VENUE_TYPES,
  INTERACTIONS,
  INTERACTION_TYPES,
  MINUTES_PER_DAY,
  TRADITIONAL_RITES,
  TRAITS,
  WEALTH,
  WEDDINGS,
  ethnicityOfState,
  formatGameDuration,
  isFamilyKind,
  traditionalWeddingCost,
  type Gender,
  type GameMinute,
  type InteractionDefinition,
  type InteractionType,
  type RelationshipDto,
  type TraditionalRites,
  type VenueType,
  type WeddingTier,
} from '@insidelife/shared';

/** What the client knows about you when previewing an interaction. The server re-checks everything. */
export interface PreviewContext {
  readonly now: GameMinute;
  readonly selfAge: number;
  readonly selfGender: Gender;
  readonly selfStateOfOrigin: string;
  readonly charisma: number;
  readonly status: number;
  readonly priceIndex: number;
  /** Type of the venue you're in (null at home, on the street or travelling). */
  readonly venueType: VenueType | null;
  /** You have a partner, fiancé(e) or spouse other than this person. */
  readonly committedElsewhere: boolean;
}

export interface InteractionOptions {
  readonly amount?: number;
  readonly tier?: WeddingTier;
}

export interface InteractionPreview {
  readonly type: InteractionType;
  readonly definition: InteractionDefinition;
  /** Why it can't happen right now (player-facing), or null. */
  readonly blocked: string | null;
  /** Fix-it hint for the block ("Find a date spot" → Map). */
  readonly fix: 'map' | null;
  /** ₦ you pay now (null when it depends on the amount you choose). */
  readonly cost: number | null;
  readonly costNote: string | null;
  /** Estimated chance they say yes (null = always works). */
  readonly odds: number | null;
  /** With real players this sends a request they accept or decline. */
  readonly viaProposal: boolean;
}

const round = (value: number): number => Math.round(value);
const price = (base: number, index: number): number => round(base * index);

/** Customs that apply: the bride's family's. */
export function ritesFor(rel: Pick<RelationshipDto, 'ethnicity'>, ctx: Pick<PreviewContext, 'selfGender' | 'selfStateOfOrigin'>): { readonly rites: TraditionalRites; readonly side: 'groom' | 'bride' } {
  const side = ctx.selfGender === 'male' ? 'groom' : 'bride';
  const ethnicity = side === 'groom' ? (rel.ethnicity ?? 'other') : ethnicityOfState(ctx.selfStateOfOrigin);
  return { rites: TRADITIONAL_RITES[ethnicity], side };
}

/** White wedding price for a tier, after the partner's family chips in (NPC partners only). */
export function weddingCost(tier: WeddingTier, rel: Pick<RelationshipDto, 'wealth' | 'isPlayer'>, priceIndex: number): number {
  const contribution = !rel.isPlayer && rel.wealth ? WEALTH[rel.wealth].weddingContribution : 0;
  return price(WEDDINGS[tier].cost * (1 - contribution), priceIndex);
}

/** Interactions that make sense for this kind of relationship, in catalog order. */
export function interactionsFor(rel: Pick<RelationshipDto, 'kind' | 'alive'>): readonly InteractionType[] {
  if (!rel.alive) return [];
  return INTERACTION_TYPES.filter((type) => INTERACTIONS[type].kinds.includes(rel.kind));
}

/** Rough odds they say yes — the server's formula without hidden state (whether they're single). Clamped 5-95%. */
export function estimateOdds(definition: InteractionDefinition, rel: RelationshipDto, ctx: PreviewContext, ringValue?: number): number | null {
  if (definition.odds === undefined) return null;
  let chance =
    definition.odds +
    (rel.closeness - 50) / 250 +
    (rel.romance - 50) / 200 +
    (ctx.charisma - 20) / 400 +
    Math.min(0.1, Math.max(0, ctx.status) / 5_000);
  for (const trait of rel.traits) chance += TRAITS[trait].acceptance[definition.id] ?? 0;
  if (definition.id === 'propose' && ringValue) chance += 0.08 * Math.log10(Math.max(1, ringValue / 150_000));
  return Math.max(0.05, Math.min(0.95, chance));
}

function datingDays(rel: RelationshipDto, now: GameMinute): number {
  return rel.datingSince === null ? 0 : Math.max(0, Math.floor((now - rel.datingSince) / MINUTES_PER_DAY));
}

function check(definition: InteractionDefinition, rel: RelationshipDto, ctx: PreviewContext, options: InteractionOptions): { blocked: string | null; fix: 'map' | null } {
  const name = rel.firstName;
  const ok = { blocked: null, fix: null };
  const no = (blocked: string, fix: 'map' | null = null) => ({ blocked, fix });
  if (!rel.alive) return no(`${name} has passed on. May they rest in peace.`);
  if (definition.romantic && isFamilyKind(rel.kind)) return no('Ah ah! That’s family.');
  if (definition.romantic && (ctx.selfAge < 18 || rel.age < 18)) return no('Romance is for 18+. Face your books.');
  const until = rel.cooldowns[definition.id];
  if (until !== undefined && until > ctx.now) return no(`Give it some time — try again in ${formatGameDuration(until - ctx.now)}.`);
  if (definition.minCloseness !== undefined && rel.closeness < definition.minCloseness) {
    return no(`You and ${name} aren’t that close yet (closeness ${Math.round(rel.closeness)}/${definition.minCloseness}).`);
  }
  if (definition.minRomance !== undefined && rel.romance < definition.minRomance) {
    return no(`There isn’t enough spark yet (romance ${Math.round(rel.romance)}/${definition.minRomance}).`);
  }
  if (definition.minDatingDays !== undefined) {
    const days = datingDays(rel, ctx.now);
    if (days < definition.minDatingDays) return no(`You’ve only been dating ${days} day${days === 1 ? '' : 's'}. Take it slow (${definition.minDatingDays}+ days).`);
  }
  if (definition.venueTypes && (!ctx.venueType || !definition.venueTypes.includes(ctx.venueType))) {
    return no('Go somewhere nice first — a restaurant, lounge, cinema, beach or park.', 'map');
  }
  if ((definition.id === 'ask-out' || definition.id === 'propose') && ctx.committedElsewhere) return no('You’re already with someone. Lagos is small o — finish that first.');
  if (definition.needsAmount && options.amount !== undefined) {
    const { min, max } = definition.needsAmount;
    if (!Number.isInteger(options.amount) || options.amount < min || options.amount > max) return no(`Choose an amount between ₦${min.toLocaleString('en-NG')} and ₦${max.toLocaleString('en-NG')}.`);
  }
  switch (definition.id) {
    case 'introduction':
      if (rel.introductionDone) return no('The families have already been introduced.');
      break;
    case 'traditional-wedding':
      if (!rel.introductionDone) return no('Do the introduction first — the families must meet.');
      if (rel.traditionalWeddingDone) return no('You’ve already done the traditional wedding.');
      break;
    case 'white-wedding':
      if (rel.whiteWeddingDone) return no('You’ve already had your white wedding.');
      break;
    case 'try-for-baby':
      if (ctx.selfGender === rel.gender) return no('Biology says no. Adoption is coming in a future update.');
      if (rel.expectingAt !== null) return no('There’s already a baby on the way!');
      break;
    default:
      break;
  }
  return ok;
}

function costOf(definition: InteractionDefinition, rel: RelationshipDto, ctx: PreviewContext, options: InteractionOptions): { cost: number | null; costNote: string | null } {
  switch (definition.id) {
    case 'gift':
      return { cost: options.amount ?? null, costNote: rel.wealth ? `They’d be impressed by about ₦${WEALTH[rel.wealth].giftExpectation.toLocaleString('en-NG')}` : null };
    case 'propose':
      return { cost: options.amount ?? null, costNote: 'The ring is yours to choose' };
    case 'date': {
      const base = (ctx.venueType && DATE_COSTS[ctx.venueType]) ?? definition.baseCost;
      return { cost: price(base, ctx.priceIndex), costNote: ctx.venueType && DATE_VENUE_TYPES.includes(ctx.venueType) ? 'Priced for where you are' : 'Depends on where you go' };
    }
    case 'introduction': {
      const { rites } = ritesFor(rel, ctx);
      return { cost: price(rites.introductionCost, ctx.priceIndex), costNote: rites.introductionLabel };
    }
    case 'traditional-wedding': {
      const { rites, side } = ritesFor(rel, ctx);
      return {
        cost: price(traditionalWeddingCost(rites, side), ctx.priceIndex),
        costNote: `${rites.ceremonyLabel} — ${side === 'groom' ? 'you bring the bride price and the list' : 'your family hosts the feast'}`,
      };
    }
    case 'white-wedding':
      return { cost: options.tier ? weddingCost(options.tier, rel, ctx.priceIndex) : null, costNote: 'Pick a style' };
    case 'divorce':
      return { cost: price(definition.baseCost, ctx.priceIndex), costNote: rel.isPlayer ? 'Lawyers and court fees' : 'Plus a settlement from your cash' };
    default:
      return { cost: definition.baseCost > 0 ? price(definition.baseCost, ctx.priceIndex) : 0, costNote: null };
  }
}

/** Requirements, cost and odds for one interaction with one person — shown before you commit. */
export function previewInteraction(type: InteractionType, rel: RelationshipDto, ctx: PreviewContext, options: InteractionOptions = {}): InteractionPreview {
  const definition = INTERACTIONS[type];
  const { blocked, fix } = check(definition, rel, ctx, options);
  const { cost, costNote } = costOf(definition, rel, ctx, options);
  const viaProposal = rel.isPlayer && definition.withPlayers === 'proposal';
  return { type, definition, blocked, fix, cost, costNote, odds: viaProposal ? null : estimateOdds(definition, rel, ctx, options.amount), viaProposal };
}
