import { Injectable } from '@nestjs/common';
import {
  DATE_COSTS,
  INTERACTIONS,
  MINUTES_PER_DAY,
  PREGNANCY_DAYS,
  TRADITIONAL_RITES,
  WEALTH,
  WEDDINGS,
  ethnicityOfState,
  formatNaira,
  traditionalWeddingCost,
  yearsBetween,
  type InteractionEffects,
  type RitesSide,
  type TraditionalRites,
  type WeddingTier,
} from '@insidelife/shared';
import { GameRuleException } from '../../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { addMood, adjustStatus, boostNeeds } from '../family.util.js';
import { currentPartner, fullName, identityOf, type Identity } from '../interfaces/family-graph.js';
import type { InteractionContext, InteractionOutcome } from '../interfaces/interaction.interface.js';
import { acceptanceChance, fertility } from '../rules/interaction.rules.js';
import { HealthBridge } from './health-bridge.service.js';
import { MarriagesService } from './marriages.service.js';
import { PlayerNotifier } from './player-notifier.service.js';
import { RelationshipsService } from './relationships.service.js';

/** The jeweller buys a rejected ring back at this share. */
export const RING_BUYBACK = 0.6;
/** Divorcing an NPC spouse: share of your cash that leaves with them. */
const DIVORCE_SETTLEMENT_SHARE = 0.1;
/** Daily chance a neglected NPC partner (romance < 20) calls it quits. */
const NEGLECT_BREAKUP_CHANCE = 0.04;

const DATE_LINES = [
  'Suya, small chops and gist until the waiter started stacking chairs.',
  'They laughed at all your jokes. Even the bad ones.',
  'You split a plate of asun and argued about Wizkid vs Davido. Chemistry.',
  'The NEPA light went off mid-dessert. Candlelight, by accident. Perfect.',
];
const FLIRT_WINS = ['They blushed. You saw it.', '“You’re funny o.” That’s a yes in Lagos.', 'They replied with three emojis. Progress.'];
const FLIRT_FAILS = ['“Lol.” Just “lol”.', 'They left you on read. Painful.', 'They said you remind them of their uncle. Abort.'];

/**
 * Romance: flirting, dating, proposals, the introduction, traditional and white weddings, break-ups, divorce and
 * trying for a baby. NPCs answer with deterministic odds; players act on their own side and are notified.
 */
@Injectable()
export class RomanceService {
  constructor(
    private readonly relationships: RelationshipsService,
    private readonly marriages: MarriagesService,
    private readonly health: HealthBridge,
    private readonly notifier: PlayerNotifier,
  ) {}

  async flirt(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    const name = ic.identity.firstName;
    if (ic.identity.isPlayer) {
      this.apply(ctx, ic, ic.definition.effects);
      await this.tell(ctx, ic, '😉 Someone is flirting with you', `${ctx.character.firstName} is shooting their shot. Your move.`);
      return { success: true, title: `You flirted with ${name}`, body: 'Message delivered. Let’s see what they do with it.', tone: 'good', moneyDelta: 0 };
    }
    const rng = ctx.rng('interaction', ic.rel.id, 'flirt', ic.attempt);
    if (rng.chance(this.odds(ctx, ic))) {
      this.apply(ctx, ic, ic.definition.effects);
      return { success: true, title: `${name} is into it`, body: rng.pick(FLIRT_WINS), tone: 'good', moneyDelta: 0 };
    }
    this.apply(ctx, ic, ic.definition.failure ?? {});
    return { success: false, title: 'Awkward…', body: rng.pick(FLIRT_FAILS), tone: 'bad', moneyDelta: 0 };
  }

  async askOut(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    const name = ic.identity.firstName;
    const person = ic.identity.person;
    const rng = ctx.rng('interaction', ic.rel.id, 'ask-out', ic.attempt);
    if (person && !person.available) {
      this.apply(ctx, ic, ic.definition.failure ?? {});
      return { success: false, title: `${name} is taken`, body: `${name} showed you their ring/partner’s picture. Respect it.`, tone: 'bad', moneyDelta: 0 };
    }
    if (!rng.chance(this.odds(ctx, ic))) {
      this.apply(ctx, ic, ic.definition.failure ?? {});
      return { success: false, title: `${name} said “let’s just be friends”`, body: 'Friend-zoned. It happens to the best of us.', tone: 'bad', moneyDelta: 0 };
    }
    this.relationships.changeKind(ic.rel, 'partner', ctx.time);
    this.apply(ctx, ic, ic.definition.effects);
    if (person) {
      person.available = false;
      await this.relationships.savePeople(ctx, person);
    }
    this.relationships.householdChanged(ctx);
    return { success: true, title: `You’re dating ${name}!`, body: `${name} said yes. Update your WhatsApp status (or don’t, if you’re wise).`, tone: 'good', moneyDelta: 0 };
  }

  async date(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    const name = ic.identity.firstName;
    if ((ic.rel.flags.abroadUntil ?? 0) > ctx.time) {
      throw new GameRuleException('ABROAD', `${name} is abroad. Video call them instead.`);
    }
    const base = (ic.venue && DATE_COSTS[ic.venue.type]) ?? ic.definition.baseCost;
    const cost = ctx.world.price(base, ctx.time);
    await ctx.wallet.pay(cost, 'purchase', `Date with ${name}${ic.venue ? ` at ${ic.venue.name}` : ''}`, this.key(ic));
    this.apply(ctx, ic, ic.definition.effects);
    if (ic.identity.isPlayer) {
      await this.tell(ctx, ic, `Date night with ${ctx.character.firstName}`, `${ctx.character.firstName} treated you to a date${ic.venue ? ` at ${ic.venue.name}` : ''}.`);
    }
    const rng = ctx.rng('interaction', ic.rel.id, 'date', ic.attempt);
    return { success: true, title: `Lovely date with ${name}`, body: rng.pick(DATE_LINES), tone: 'good', moneyDelta: -cost };
  }

  async propose(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    const name = ic.identity.firstName;
    const ring = ic.request.amount ?? 0;
    await ctx.wallet.pay(ring, 'purchase', `Engagement ring for ${name}`, this.key(ic));
    const rng = ctx.rng('interaction', ic.rel.id, 'propose', ic.attempt);
    if (!rng.chance(this.odds(ctx, ic, ring))) {
      const refund = Math.round(ring * RING_BUYBACK);
      await ctx.wallet.receive(refund, 'refund', 'Jeweller bought back the ring', `${this.key(ic)}:buyback`, { income: 'neutral' });
      this.apply(ctx, ic, ic.definition.failure ?? {});
      return {
        success: false,
        title: `${name} said no`,
        body: `In front of everybody at the restaurant. The jeweller bought the ring back for ${formatNaira(refund)}. Your pride is not refundable.`,
        tone: 'bad',
        moneyDelta: refund - ring,
      };
    }
    this.relationships.changeKind(ic.rel, 'fiance', ctx.time);
    this.relationships.setFlags(ic.rel, { ringValue: ring });
    this.apply(ctx, ic, ic.definition.effects);
    adjustStatus(ctx, 5);
    this.relationships.householdChanged(ctx);
    return { success: true, title: `${name} said YES! 💍`, body: 'Screaming, crying, a flash mob you didn’t organise. Time to meet the families.', tone: 'good', moneyDelta: -ring };
  }

  async introduction(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    const { rites } = this.culture(ctx, ic.identity);
    const cost = ctx.world.price(rites.introductionCost, ctx.time);
    await ctx.wallet.pay(cost, 'ceremony', `${rites.introductionLabel} — ${ic.identity.firstName}’s family`, this.key(ic));
    this.relationships.setFlags(ic.rel, { introductionDone: true });
    this.apply(ctx, ic, ic.definition.effects);
    if (ic.identity.isPlayer) {
      await this.tell(ctx, ic, 'The families have met', `${ctx.character.firstName}’s people came for the ${rites.introductionLabel.toLowerCase()}. Kola has been broken.`);
    }
    return {
      success: true,
      title: rites.introductionLabel,
      body: `The families met over kola, drinks and many questions about your “prospects”. They approve — mostly.`,
      tone: 'good',
      moneyDelta: -cost,
    };
  }

  async traditionalWedding(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    const { rites, side } = this.culture(ctx, ic.identity);
    const cost = ctx.world.price(traditionalWeddingCost(rites, side), ctx.time);
    await this.assertCanMarry(ctx, ic);
    await ctx.wallet.pay(cost, 'ceremony', `${rites.ceremonyLabel} with ${ic.identity.firstName}`, this.key(ic));
    this.relationships.setFlags(ic.rel, { traditionalDone: true });
    const newlyMarried = await this.marry(ctx, ic, { tier: null, traditional: true });
    this.apply(ctx, ic, ic.definition.effects);
    const sideLine = side === 'groom' ? `You paid the bride price and the list` : `Your family hosted, the groom’s people brought the list`;
    return {
      success: true,
      title: newlyMarried ? `Married — ${rites.ceremonyLabel}` : rites.ceremonyLabel,
      body: `${sideLine}. ${rites.blurb}`,
      tone: 'good',
      moneyDelta: -cost,
    };
  }

  async whiteWedding(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    const tier = ic.request.tier as WeddingTier;
    const wedding = WEDDINGS[tier];
    const contribution = ic.identity.person ? WEALTH[ic.identity.person.wealth].weddingContribution : 0;
    const cost = ctx.world.price(Math.round(wedding.cost * (1 - contribution)), ctx.time);
    await this.assertCanMarry(ctx, ic);
    await ctx.wallet.pay(cost, 'ceremony', `${wedding.label} with ${ic.identity.firstName}`, this.key(ic));
    this.relationships.setFlags(ic.rel, { whiteWeddingDone: true });
    const newlyMarried = await this.marry(ctx, ic, { tier, traditional: false });
    this.apply(ctx, ic, ic.definition.effects);
    adjustStatus(ctx, wedding.status);
    const help = contribution > 0 ? ` ${ic.identity.firstName}’s family covered ${Math.round(contribution * 100)}%.` : '';
    return {
      success: true,
      title: newlyMarried ? `Just married! ${wedding.label}` : wedding.label,
      body: `${wedding.blurb} ${wedding.guests} guests came; at least 40 were uninvited.${help}`,
      tone: 'good',
      moneyDelta: -cost,
    };
  }

  async breakUp(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    const name = ic.identity.firstName;
    this.relationships.changeKind(ic.rel, 'ex', ctx.time);
    this.relationships.setFlags(ic.rel, { endedBy: 'me' });
    this.apply(ctx, ic, ic.definition.effects);
    if (ic.identity.person) {
      ic.identity.person.available = true;
      await this.relationships.savePeople(ctx, ic.identity.person);
    }
    if (ic.identity.isPlayer) await this.tell(ctx, ic, `${ctx.character.firstName} broke up with you`, 'It’s over. Chai. Take some time, eat some ice cream.');
    this.relationships.householdChanged(ctx);
    return { success: true, title: `You and ${name} are done`, body: 'It’s not you, it’s Lagos. Single and ready to mingle… eventually.', tone: 'neutral', moneyDelta: 0 };
  }

  async divorce(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    const name = ic.identity.firstName;
    const fee = ctx.world.price(ic.definition.baseCost, ctx.time);
    await ctx.wallet.pay(fee, 'fee', `Divorce: lawyers and court fees`, this.key(ic));
    let settlement = 0;
    if (ic.identity.person) {
      settlement = Math.round(ctx.wallet.cash * DIVORCE_SETTLEMENT_SHARE);
      await ctx.wallet.pay(settlement, 'fee', `Divorce settlement for ${name}`, `${this.key(ic)}:settlement`);
      ic.identity.person.available = true;
      await this.relationships.savePeople(ctx, ic.identity.person);
    }
    const marriage = await this.marriages.active(ctx);
    if (marriage) await this.marriages.end(ctx, marriage, 'divorced');
    this.relationships.changeKind(ic.rel, 'ex', ctx.time);
    this.relationships.setFlags(ic.rel, { endedBy: 'me' });
    this.apply(ctx, ic, ic.definition.effects);
    if (ic.identity.isPlayer) await this.tell(ctx, ic, 'Divorce papers served', `${ctx.character.firstName} has filed for divorce. The aunties have been informed.`);
    this.relationships.householdChanged(ctx);
    const settled = settlement > 0 ? ` ${name} left with ${formatNaira(settlement)} and the good pots.` : '';
    return { success: true, title: 'Divorced', body: `Lawyers, family meetings and the aunties’ verdict.${settled}`, tone: 'bad', moneyDelta: -(fee + settlement) };
  }

  async tryForBaby(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    const name = ic.identity.firstName;
    const womanAge = ctx.character.gender === 'female' ? ctx.age : yearsBetween(ic.identity.bornAt, ctx.time);
    const familyOriented = ic.identity.person?.traits.includes('family-oriented') ? 0.05 : 0;
    const romance = this.relationships.romance(ic.rel, ctx.time);
    const chance = Math.max(0.02, Math.min(0.6, (ic.definition.odds ?? 0.3) * fertility(womanAge) * (0.7 + romance / 200) + familyOriented));
    const rng = ctx.rng('conceive', ic.rel.id, ic.attempt);
    this.apply(ctx, ic, ic.definition.effects);
    if (!rng.chance(chance)) {
      return { success: false, title: 'Not this month', body: 'Mummy has added you to her prayer list. And her pastor’s. And the WhatsApp prayer chain.', tone: 'neutral', moneyDelta: 0 };
    }
    // Health tracks the pregnancy for both genders (a man's partner's pregnancy runs through him) and records the birth.
    const started = await this.health.conceive(ctx, fullName(ic.identity));
    if (started === null && ctx.character.gender === 'male' && ic.identity.person) {
      // Health module unavailable: the family domain carries the NPC partner's pregnancy itself.
      this.relationships.setFlags(ic.rel, { pregnancyDueAt: ctx.time + PREGNANCY_DAYS * MINUTES_PER_DAY });
    } else if (!started) {
      return { success: false, title: 'Not this month', body: 'The clinic is closed today. Try again soon.', tone: 'neutral', moneyDelta: 0 };
    }
    addMood(ctx, 'expecting', 'Baby on the way', 10, 14);
    return ctx.character.gender === 'female'
      ? { success: true, title: 'You’re pregnant! 🤰', body: `You and ${name} are expecting. Book your antenatal — and hide it from the aunties for now.`, tone: 'good', moneyDelta: 0 }
      : { success: true, title: `${name} is pregnant! 🤰`, body: 'The baby is due in nine months. Start saving for the naming ceremony.', tone: 'good', moneyDelta: 0 };
  }

  /**
   * A player couple agreed to try for a baby: only the woman's session starts the pregnancy (so it is tracked once,
   * and the birth is recorded once with both players as parents).
   */
  async conceiveAfterConsent(ctx: SimulationContext, partnerName: string, key: string): Promise<boolean> {
    if (ctx.character.gender !== 'female') return false;
    if (await this.health.isPregnant(ctx)) return false;
    const chance = Math.max(0.02, Math.min(0.6, (INTERACTIONS['try-for-baby'].odds ?? 0.3) * fertility(ctx.age)));
    if (!ctx.rng('conceive', key).chance(chance)) return false;
    return (await this.health.conceive(ctx, partnerName)) ?? false;
  }

  /** Daily: being in love lifts mood; a neglected NPC partner may leave; a cold marriage weighs on you. */
  async daily(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const graph = await this.relationships.graph(ctx);
    const partner = currentPartner(graph);
    if (!partner) return;
    const identity = identityOf(graph, partner);
    const romance = this.relationships.romance(partner, ctx.time);
    if (romance >= 70) addMood(ctx, 'in-love', `In love with ${identity.firstName}`, 6, 1);
    else if (romance < 20 && partner.kind === 'spouse') addMood(ctx, 'marriage-strain', 'Marriage on the rocks', -6, 1);
    if (identity.isPlayer || partner.kind === 'spouse' || romance >= 20) return;
    if (!ctx.rng('npc-breakup', partner.id, dayIndex).chance(NEGLECT_BREAKUP_CHANCE)) return;

    this.relationships.changeKind(partner, 'ex', ctx.time);
    this.relationships.setFlags(partner, { endedBy: 'them' });
    this.relationships.touch(graph, partner, ctx.time, { closeness: -20 });
    if (identity.person) {
      identity.person.available = true;
      await this.relationships.savePeople(ctx, identity.person);
    }
    await this.relationships.save(ctx, partner);
    addMood(ctx, 'heartbreak', 'Heartbroken', -12, 10);
    ctx.notify({
      kind: 'relationship',
      title: `${identity.firstName} has moved on`,
      body: `“You don’t call, you don’t take me out.” ${identity.firstName} ended things${partner.flags.ringValue ? ' — and kept the ring' : ''}.`,
      tone: 'bad',
    });
    ctx.report({ label: `${identity.firstName} broke up with you`, tone: 'bad' });
    this.relationships.householdChanged(ctx);
  }

  /** Whose customs apply: the bride's family's. */
  culture(ctx: SimulationContext, identity: Identity): { readonly rites: TraditionalRites; readonly side: RitesSide } {
    const side: RitesSide = ctx.character.gender === 'male' ? 'groom' : 'bride';
    const brideEthnicity = side === 'groom' ? identity.ethnicity : ethnicityOfState(ctx.character.stateOfOrigin);
    return { rites: TRADITIONAL_RITES[brideEthnicity], side };
  }

  private odds(ctx: SimulationContext, ic: InteractionContext, ringValue?: number): number {
    const person = ic.identity.person;
    return acceptanceChance(ic.definition, {
      closeness: this.relationships.closeness(ic.rel, ctx.time),
      romance: this.relationships.romance(ic.rel, ctx.time),
      charisma: ctx.character.skills.charisma,
      status: ctx.character.status,
      traits: person?.traits ?? [],
      available: person?.available ?? true,
      ringValue,
    });
  }

  /** Apply an effects bundle to the relationship and the character (the caller saves the relationship). */
  private apply(ctx: SimulationContext, ic: InteractionContext, effects: InteractionEffects): void {
    this.relationships.touch(ic.graph, ic.rel, ctx.time, { closeness: effects.closeness ?? 0, romance: effects.romance });
    if (effects.mood) addMood(ctx, `romance:${ic.definition.id}`, ic.definition.label, effects.mood, effects.moodDays ?? 1);
    if (effects.social || effects.fun) boostNeeds(ctx, { social: effects.social ?? 0, fun: effects.fun ?? 0 });
    if (effects.status) adjustStatus(ctx, effects.status);
  }

  private async assertCanMarry(ctx: SimulationContext, ic: InteractionContext): Promise<void> {
    const marriage = await this.marriages.active(ctx);
    const toThisPerson =
      marriage && ((ic.rel.personId && marriage.spousePersonId === ic.rel.personId) || (ic.rel.otherCharacterId && [marriage.characterId, marriage.spouseCharacterId].includes(ic.rel.otherCharacterId)));
    if (marriage && !toThisPerson) throw new GameRuleException('ALREADY_MARRIED', 'You’re already married to someone else. One wahala at a time.');
    if (!marriage && ic.identity.player) {
      const theirs = await MarriagesService.activeFor(ctx.manager, ic.identity.player.id);
      if (theirs) throw new GameRuleException('PARTNER_MARRIED', `${ic.identity.firstName} is already married.`);
    }
  }

  /** Create (or upgrade) the marriage. Returns true when this wedding made you married. */
  private async marry(ctx: SimulationContext, ic: InteractionContext, details: { readonly tier: WeddingTier | null; readonly traditional: boolean }): Promise<boolean> {
    const existing = await this.marriages.active(ctx);
    if (existing) {
      if (details.tier) existing.weddingTier = details.tier;
      if (details.traditional) existing.traditional = true;
      await this.marriages.update(ctx, existing);
      return false;
    }
    const spouse = ic.rel.personId ? { personId: ic.rel.personId } : { characterId: ic.rel.otherCharacterId ?? '' };
    await this.marriages.marry(ctx, spouse, details);
    this.relationships.changeKind(ic.rel, 'spouse', ctx.time);
    const person = ic.identity.person;
    if (person) {
      person.available = false;
      if (ctx.character.gender === 'male' && person.gender === 'female') person.lastName = ctx.character.lastName;
      await this.relationships.savePeople(ctx, person);
    }
    if (ic.identity.isPlayer) {
      await this.tell(ctx, ic, `You’re married to ${ctx.character.firstName}! 💍`, 'The wedding is done and the jollof is finished. Congratulations, Mr & Mrs!');
    }
    this.relationships.householdChanged(ctx);
    return true;
  }

  private async tell(ctx: SimulationContext, ic: InteractionContext, title: string, body: string): Promise<void> {
    const player = ic.identity.player;
    if (player) await this.notifier.notify(ctx, player.id, { kind: 'relationship', title, body, tone: 'neutral' });
  }

  /** Deterministic ledger key for this attempt. */
  private key(ic: InteractionContext): string {
    return `romance:${ic.rel.id}:${ic.definition.id}:${ic.attempt}`;
  }
}
