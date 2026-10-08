import { Injectable } from '@nestjs/common';
import {
  DATE_VENUE_TYPES,
  INTERACTIONS,
  WEALTH,
  findVenue,
  formatNaira,
  isRomanticKind,
  type ActionDefinition,
  type InteractionDefinition,
  type InteractionRequest,
  type InteractionResultDto,
  type VenueDefinition,
} from '@insidelife/shared';
import { GameRuleException, ResourceNotFoundException } from '../../../common/exceptions/domain.exception.js';
import type { ActivityState } from '../../characters/entities/character.entity.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { SocialGuard } from '../../social/social-guard.service.js';
import type { RelationshipEntity } from '../entities/relationship.entity.js';
import { toRelationshipDto } from '../family.mapper.js';
import { boostNeeds } from '../family.util.js';
import { ageOf, currentPartner, familyTitle, identityOf, type FamilyGraph, type Identity } from '../interfaces/family-graph.js';
import type { InteractionContext, InteractionOutcome } from '../interfaces/interaction.interface.js';
import { checkInteraction, cooldownEnd, giftCloseness, type InteractionState } from '../rules/interaction.rules.js';
import { HealthBridge } from './health-bridge.service.js';
import { PlayerLinksService } from './player-links.service.js';
import { PlayerNotifier } from './player-notifier.service.js';
import { RelationshipsService } from './relationships.service.js';
import { RomanceService } from './romance.service.js';

const CHAT_LINES = [
  'Voice notes, memes and a long gist about someone’s wedding.',
  'You both agreed Lagos traffic is a spiritual attack.',
  'They sent you a 4-minute voice note. You listened at 2x.',
  'Gist so hot you forgot to charge your phone.',
];
const CALL_LINES = ['A proper catch-up. You promised to visit soon.', '“How far? Long time!” Twenty minutes later, still talking.'];
const HANG_LINES = ['Suya, small chops and gist until late.', 'You argued about football and laughed until your stomach hurt.', 'Pepper soup joint, one bottle of malt each. Bonding.'];

/** Action categories that count as spending time with someone when an action targets them. */
const SOCIAL_CATEGORIES: ReadonlySet<ActionDefinition['category']> = new Set(['food', 'fun', 'social', 'fitness', 'spiritual']);

/**
 * Validates and runs interactions with the people in your life. Social interactions live here; romance and
 * weddings are delegated to `RomanceService`; consent-based steps with real players become proposals.
 */
@Injectable()
export class InteractionsService {
  constructor(
    private readonly relationships: RelationshipsService,
    private readonly romance: RomanceService,
    private readonly links: PlayerLinksService,
    private readonly health: HealthBridge,
    private readonly notifier: PlayerNotifier,
    private readonly guard: SocialGuard,
  ) {}

  async interact(ctx: SimulationContext, relationshipId: string, request: InteractionRequest): Promise<InteractionResultDto> {
    await this.links.reconcile(ctx);
    const graph = await this.relationships.graph(ctx);
    const rel = graph.relationships.find((candidate) => candidate.id === relationshipId);
    if (!rel) throw new ResourceNotFoundException('Relationship');
    const definition = INTERACTIONS[request.type];
    const identity = identityOf(graph, rel);
    if (identity.player) await this.guard.assertNotBlocked(ctx.character.id, identity.player.id, ctx.manager);
    const venue = findVenue(ctx.character.locationId) ?? null;

    const blocked = checkInteraction(definition, await this.state(ctx, graph, rel, identity, definition, request, venue));
    if (blocked) throw new GameRuleException(blocked.code, blocked.message);

    const attempt = this.relationships.markInteraction(rel, definition.id, cooldownEnd(definition, ctx.time));
    const ic: InteractionContext = { graph, rel, identity, definition, request, venue, attempt };
    const outcome = identity.isPlayer && definition.withPlayers === 'proposal' ? await this.links.fromInteraction(ctx, ic) : await this.dispatch(ctx, ic);
    await this.relationships.save(ctx, rel);
    return {
      success: outcome.success,
      title: outcome.title,
      body: outcome.body,
      tone: outcome.tone,
      moneyDelta: outcome.moneyDelta,
      proposalId: outcome.proposalId ?? null,
      relationship: toRelationshipDto(graph, rel, ctx.time),
    };
  }

  /** An action started with `targetId` (dinner, cinema, gym with someone) counts as time together — a date if romantic. */
  async onTargetedAction(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void> {
    if (!activity.targetId || !SOCIAL_CATEGORIES.has(action.category)) return;
    const graph = await this.relationships.graph(ctx);
    const rel = this.relationships.find(graph, activity.targetId);
    if (!rel) return;
    const identity = identityOf(graph, rel);
    if (!identity.alive) return;
    const venueType = findVenue(activity.locationId)?.type;
    const date = isRomanticKind(rel.kind) && venueType !== undefined && DATE_VENUE_TYPES.includes(venueType);
    this.relationships.touch(graph, rel, ctx.time, { closeness: 5, romance: date ? 6 : undefined });
    await this.relationships.save(ctx, rel);
    ctx.report({ label: `${action.verb} with ${identity.firstName}`, tone: 'good' });
  }

  private async state(
    ctx: SimulationContext,
    graph: FamilyGraph,
    rel: RelationshipEntity,
    identity: Identity,
    definition: InteractionDefinition,
    request: InteractionRequest,
    venue: VenueDefinition | null,
  ): Promise<InteractionState> {
    const t = ctx.time;
    const partner = currentPartner(graph);
    const romanticStep = definition.id === 'ask-out' || definition.id === 'propose';
    const committedElsewhere =
      (partner !== null && partner.id !== rel.id) || (romanticStep && (await this.links.hasPendingRomantic(ctx, rel.otherCharacterId)));
    const expecting =
      rel.flags.pregnancyDueAt !== undefined ||
      (definition.id === 'try-for-baby' && (await this.health.isPregnant(ctx)));
    return {
      kind: rel.kind,
      name: identity.firstName,
      alive: identity.alive,
      isPlayer: identity.isPlayer,
      closeness: this.relationships.closeness(rel, t),
      romance: this.relationships.romance(rel, t),
      selfAge: ctx.age,
      otherAge: ageOf(identity, t),
      selfGender: ctx.character.gender,
      otherGender: identity.gender,
      datingDays: RelationshipsService.daysSince(rel.flags.datingSince, t),
      venueType: venue?.type ?? null,
      together: identity.player !== null && venue !== null && identity.player.locationId === ctx.character.locationId,
      cooldownUntil: rel.flags.cooldowns?.[definition.id] ?? null,
      now: t,
      committedElsewhere,
      introductionDone: rel.flags.introductionDone ?? false,
      traditionalDone: rel.flags.traditionalDone ?? false,
      whiteWeddingDone: rel.flags.whiteWeddingDone ?? false,
      expecting,
      amount: request.amount,
      tier: request.tier,
    };
  }

  private dispatch(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    switch (ic.definition.id) {
      case 'chat':
        return this.chat(ctx, ic);
      case 'call':
        return this.call(ctx, ic);
      case 'hang-out':
        return this.hangOut(ctx, ic);
      case 'gift':
        return this.gift(ctx, ic);
      case 'flirt':
        return this.romance.flirt(ctx, ic);
      case 'ask-out':
        return this.romance.askOut(ctx, ic);
      case 'date':
        return this.romance.date(ctx, ic);
      case 'propose':
        return this.romance.propose(ctx, ic);
      case 'introduction':
        return this.romance.introduction(ctx, ic);
      case 'traditional-wedding':
        return this.romance.traditionalWedding(ctx, ic);
      case 'white-wedding':
        return this.romance.whiteWedding(ctx, ic);
      case 'break-up':
        return this.romance.breakUp(ctx, ic);
      case 'divorce':
        return this.romance.divorce(ctx, ic);
      case 'try-for-baby':
        return this.romance.tryForBaby(ctx, ic);
    }
  }

  private async chat(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    this.relationships.touch(ic.graph, ic.rel, ctx.time, { closeness: ic.definition.effects.closeness ?? 0 });
    boostNeeds(ctx, { social: ic.definition.effects.social ?? 0 });
    const line = ctx.rng('interaction', ic.rel.id, 'chat', ic.attempt).pick(CHAT_LINES);
    return { success: true, title: `Gist with ${this.title(ic)}`, body: line, tone: 'good', moneyDelta: 0 };
  }

  private async call(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    const cost = ctx.world.price(ic.definition.baseCost, ctx.time);
    await ctx.wallet.pay(cost, 'purchase', `Airtime: call with ${ic.identity.firstName}`, this.key(ic));
    this.relationships.touch(ic.graph, ic.rel, ctx.time, { closeness: ic.definition.effects.closeness ?? 0 });
    boostNeeds(ctx, { social: ic.definition.effects.social ?? 0 });
    const line = ctx.rng('interaction', ic.rel.id, 'call', ic.attempt).pick(CALL_LINES);
    return { success: true, title: `Called ${this.title(ic)}`, body: line, tone: 'good', moneyDelta: -cost };
  }

  private async hangOut(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    const cost = ctx.world.price(ic.definition.baseCost, ctx.time);
    await ctx.wallet.pay(cost, 'purchase', `Hanging out with ${ic.identity.firstName}`, this.key(ic));
    const partyBonus = ic.identity.person?.traits.includes('party-lover') && (ic.venue?.type === 'bar' || ic.venue?.type === 'club') ? 2 : 0;
    this.relationships.touch(ic.graph, ic.rel, ctx.time, { closeness: (ic.definition.effects.closeness ?? 0) + partyBonus });
    boostNeeds(ctx, { social: ic.definition.effects.social ?? 0, fun: ic.definition.effects.fun ?? 0 });
    if (ic.identity.player) {
      await this.notifier.notify(ctx, ic.identity.player.id, {
        kind: 'social',
        title: `${ctx.character.firstName} hung out with you`,
        body: `Good vibes${ic.venue ? ` at ${ic.venue.name}` : ''}. ${ctx.character.firstName} paid.`,
        tone: 'good',
      });
    }
    const line = ctx.rng('interaction', ic.rel.id, 'hang-out', ic.attempt).pick(HANG_LINES);
    return { success: true, title: `Hung out with ${this.title(ic)}`, body: line, tone: 'good', moneyDelta: -cost };
  }

  private async gift(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    const amount = ic.request.amount ?? 0;
    const name = ic.identity.firstName;
    await ctx.wallet.pay(amount, 'purchase', `Gift for ${name}`, this.key(ic));
    const expectation = ic.identity.person ? WEALTH[ic.identity.person.wealth].giftExpectation : WEALTH.managing.giftExpectation;
    const ratio = amount / expectation;
    const closeness = giftCloseness(amount, expectation);
    const romantic = isRomanticKind(ic.rel.kind) || this.relationships.romance(ic.rel, ctx.time) > 10;
    this.relationships.touch(ic.graph, ic.rel, ctx.time, { closeness, romance: romantic ? Math.round(closeness * 0.6) : undefined });
    if (ic.identity.player) {
      await this.notifier.notify(ctx, ic.identity.player.id, {
        kind: 'social',
        title: `🎁 ${ctx.character.firstName} sent you a gift`,
        body: `Flowers, chocolates and a card — worth ${formatNaira(amount)}. Somebody is thinking of you.`,
        tone: 'good',
      });
    }
    const body =
      ratio < 0.5
        ? `${name} said thank you… politely.`
        : ratio > 10
          ? `${name} is asking what you want from them. Very generous!`
          : `${name} loved it. You’re now their favourite person (this week).`;
    return { success: true, title: `Gift for ${name}`, body, tone: 'good', moneyDelta: -amount };
  }

  /** "Mummy", "Daddy", "Grandma" — or their first name. */
  private title(ic: InteractionContext): string {
    return familyTitle(ic.rel.kind, ic.identity);
  }

  private key(ic: InteractionContext): string {
    return `interaction:${ic.rel.id}:${ic.definition.id}:${ic.attempt}`;
  }
}
