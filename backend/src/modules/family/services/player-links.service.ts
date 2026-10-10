import { Injectable } from '@nestjs/common';
import { In, IsNull, Not } from 'typeorm';
import {
  RING_LIMITS,
  formatNaira,
  isFamilyKind,
  isRomanticKind,
  yearsBetween,
  type ProposalDto,
  type ProposalKind,
  type ProposalsDto,
} from '@insidelife/shared';
import { ConflictException, GameRuleException, ResourceNotFoundException } from '../../../common/exceptions/domain.exception.js';
import { CharacterEntity } from '../../characters/entities/character.entity.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { SocialGuard } from '../../social/social-guard.service.js';
import { PersonEntity } from '../entities/person.entity.js';
import { ProposalEntity } from '../entities/proposal.entity.js';
import { RelationshipEntity } from '../entities/relationship.entity.js';
import { addMood, fill } from '../family.util.js';
import { currentPartner, fullName, identityOf, type FamilyGraph, type PlayerRef } from '../interfaces/family-graph.js';
import type { InteractionContext, InteractionOutcome } from '../interfaces/interaction.interface.js';
import { MAX_FERTILE_AGE } from '../rules/interaction.rules.js';
import { MarriagesService } from './marriages.service.js';
import { PlayerNotifier } from './player-notifier.service.js';
import { RelationshipsService } from './relationships.service.js';
import { RING_BUYBACK, RomanceService } from './romance.service.js';

const RECONCILE_KEY = 'family:reconcile';
const MAX_PENDING_OUTGOING = 10;
const ROMANTIC_PROPOSALS: readonly ProposalKind[] = ['date', 'marriage'];

export type ProposalTarget = { readonly handle: string } | { readonly characterId: string };

interface ProposalOptions {
  readonly ringValue?: number;
  readonly message?: string;
}

const PROPOSAL_COPY: Readonly<Record<ProposalKind, { readonly title: string; readonly body: string }>> = {
  friend: { title: '🤝 {name} wants to be friends', body: '@{handle} sent you a friend request.' },
  date: { title: '🌹 {name} is asking you out', body: '@{handle} wants to make it official. Will you be their bae?' },
  marriage: { title: '💍 {name} proposed to you!', body: '@{handle} is on one knee with a ring worth {ring}. Say yes or break their heart.' },
  baby: { title: '👶 {name} wants to try for a baby', body: '@{handle} says Mummy has been praying for grandchildren.' },
};

/**
 * Player-to-player relationships by mutual consent. A proposal is answered in the recipient's own session; every
 * other consequence for the proposer (and weddings, break-ups and births the other player caused) is applied in the
 * proposer's next session by `reconcile`, so no session ever writes another player's state.
 */
@Injectable()
export class PlayerLinksService {
  constructor(
    private readonly relationships: RelationshipsService,
    private readonly marriages: MarriagesService,
    private readonly romance: RomanceService,
    private readonly notifier: PlayerNotifier,
    private readonly guard: SocialGuard,
  ) {}

  async propose(ctx: SimulationContext, target: ProposalTarget, kind: ProposalKind, options: ProposalOptions = {}): Promise<ProposalDto> {
    const other = await this.findPlayer(ctx, target);
    await this.guard.assertNotBlocked(ctx.character.id, other.id, ctx.manager);
    const graph = await this.relationships.graph(ctx);
    let rel = graph.relationships.find((candidate) => candidate.otherCharacterId === other.id) ?? null;
    if (await this.guard.areFriends(ctx.character.id, other.id, ctx.manager)) {
      // The social domain owns the friend list; a friendship made there counts here too.
      if (kind === 'friend') throw new ConflictException('ALREADY_FRIENDS', `You and ${other.firstName} are already friends.`);
      rel = await this.befriend(ctx, graph, rel, other.id);
    }
    await this.assertCanPropose(ctx, graph, rel, other, kind, options);

    const pending = await ctx.manager.find(ProposalEntity, { where: [{ fromCharacterId: ctx.character.id, status: 'pending' }, { fromCharacterId: other.id, toCharacterId: ctx.character.id, kind, status: 'pending' }] });
    if (pending.some((proposal) => proposal.fromCharacterId === other.id)) {
      throw new GameRuleException('PROPOSAL_WAITING', `${other.firstName} already asked you — accept theirs!`);
    }
    if (pending.some((proposal) => proposal.toCharacterId === other.id && proposal.kind === kind)) {
      throw new ConflictException('PROPOSAL_PENDING', `You already asked ${other.firstName}. Patience is a virtue.`);
    }
    if (pending.length >= MAX_PENDING_OUTGOING) throw new GameRuleException('TOO_MANY_PROPOSALS', 'You have too many requests waiting. Let people answer first.');

    if (!rel) await this.relationships.create(ctx, { otherCharacterId: other.id, kind: 'acquaintance', closeness: 10, metAt: 'online' });
    const ringValue = kind === 'marriage' ? (options.ringValue ?? 0) : 0;
    if (ringValue > 0) {
      await ctx.wallet.pay(ringValue, 'purchase', `Engagement ring for ${other.firstName}`, `proposal-ring:${other.id}:${ctx.time}`);
    }
    const proposal = await ctx.manager.save(
      ProposalEntity,
      ctx.manager.create(ProposalEntity, {
        fromCharacterId: ctx.character.id,
        toCharacterId: other.id,
        kind,
        status: 'pending',
        message: options.message?.trim().slice(0, 140) || null,
        ringValue,
        createdAtGame: ctx.time,
        respondedAtGame: null,
        proposerSynced: true,
      }),
    );
    const copy = PROPOSAL_COPY[kind];
    const values = { name: ctx.character.firstName, handle: ctx.character.handle, ring: formatNaira(ringValue) };
    await this.notifier.notify(ctx, other.id, {
      kind: 'relationship',
      title: fill(copy.title, values),
      body: `${fill(copy.body, values)}${proposal.message ? ` “${proposal.message}”` : ''}`,
      tone: 'good',
    });
    return this.toDto(proposal, this.self(ctx), other);
  }

  /** Ask-out, propose and try-for-baby with a player become proposals. */
  async fromInteraction(ctx: SimulationContext, ic: InteractionContext): Promise<InteractionOutcome> {
    const player = ic.identity.player;
    if (!player) throw new ResourceNotFoundException('Player');
    const kind: ProposalKind = ic.definition.id === 'ask-out' ? 'date' : ic.definition.id === 'propose' ? 'marriage' : 'baby';
    const proposal = await this.propose(ctx, { characterId: player.id }, kind, { ringValue: ic.request.amount });
    return {
      success: true,
      title: 'Request sent',
      body: `${player.firstName} will answer when they’re ready. No pressure. (Some pressure.)`,
      tone: 'neutral',
      moneyDelta: -proposal.ringValue,
      proposalId: proposal.id,
    };
  }

  async respond(ctx: SimulationContext, proposalId: string, accept: boolean): Promise<ProposalDto> {
    const proposal = await ctx.manager.findOne(ProposalEntity, {
      where: { id: proposalId, toCharacterId: ctx.character.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!proposal) throw new ResourceNotFoundException('Proposal');
    if (proposal.status !== 'pending') throw new GameRuleException('ALREADY_ANSWERED', 'You already answered that one.');
    const [proposer] = await this.relationships.loadPlayers(ctx, [proposal.fromCharacterId]);
    // A proposer whose account was deleted can't be answered; the proposal stays as it is in case the account is
    // restored (and is left out of the list meanwhile).
    if ((await this.hidden(ctx, [proposal.fromCharacterId])).size > 0) throw new ResourceNotFoundException('Proposal');
    if (!proposer?.alive) {
      // Close it for good (returning, not throwing, so the cancellation commits) and say why.
      proposal.status = 'cancelled';
      proposal.proposerSynced = false;
      await ctx.manager.save(ProposalEntity, proposal);
      ctx.notify({ kind: 'relationship', title: 'Proposal closed', body: 'They are no longer with us. May they rest in peace.', tone: 'neutral' });
      if (!proposer) throw new ResourceNotFoundException('Proposal');
      return this.toDto(proposal, proposer, this.self(ctx));
    }

    await this.reconcile(ctx);
    const graph = await this.relationships.graph(ctx);
    let rel = graph.relationships.find((candidate) => candidate.otherCharacterId === proposer.id) ?? null;
    let body = '';
    if (accept) {
      await this.guard.assertNotBlocked(ctx.character.id, proposer.id, ctx.manager);
      this.assertCanAccept(ctx, graph, rel, proposer, proposal);
      rel ??= await this.relationships.create(ctx, { otherCharacterId: proposer.id, kind: 'acquaintance', closeness: 10, metAt: 'online' });
      body = await this.applyAccepted(ctx, graph, rel, proposal, proposer);
      await this.relationships.save(ctx, rel);
    }
    proposal.status = accept ? 'accepted' : 'declined';
    proposal.respondedAtGame = ctx.time;
    proposal.proposerSynced = false;
    await ctx.manager.save(ProposalEntity, proposal);

    const me = ctx.character.firstName;
    const answer = this.answerCopy(proposal.kind, accept, me);
    await this.notifier.notify(ctx, proposer.id, { kind: 'relationship', title: answer.title, body: `${answer.body}${body ? ` ${body}` : ''}`, tone: accept ? 'good' : 'bad' });
    return this.toDto(proposal, proposer, this.self(ctx));
  }

  async list(ctx: SimulationContext): Promise<ProposalsDto> {
    await this.reconcile(ctx);
    const me = ctx.character.id;
    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const incoming = await ctx.manager.find(ProposalEntity, { where: { toCharacterId: me, status: 'pending' }, order: { createdAtGame: 'DESC' }, take: 50 });
    const outgoing = await ctx.manager.find(ProposalEntity, { where: { fromCharacterId: me }, order: { createdAtGame: 'DESC' }, take: 20 });
    const ids = [...new Set([...incoming.map((p) => p.fromCharacterId), ...outgoing.map((p) => p.toCharacterId)])];
    const hidden = await this.hidden(ctx, ids);
    const players = new Map(
      (await this.relationships.loadPlayers(ctx, ids)).filter((player) => !hidden.has(player.id)).map((player) => [player.id, player]),
    );
    const self = this.self(ctx);
    return {
      incoming: incoming.flatMap((p) => {
        const from = players.get(p.fromCharacterId);
        return from ? [this.toDto(p, from, self)] : [];
      }),
      outgoing: outgoing.flatMap((p) => {
        const to = players.get(p.toCharacterId);
        return to ? [this.toDto(p, self, to)] : [];
      }),
    };
  }

  /** You have asked a player out or proposed and are waiting (counts as being spoken for). */
  async hasPendingRomantic(ctx: SimulationContext, exceptCharacterId: string | null): Promise<boolean> {
    const pending = await ctx.manager.find(ProposalEntity, {
      where: { fromCharacterId: ctx.character.id, status: 'pending', kind: In([...ROMANTIC_PROPOSALS]) },
      select: { id: true, toCharacterId: true },
    });
    return pending.some((proposal) => proposal.toCharacterId !== exceptCharacterId);
  }

  /**
   * Apply what other players did since this character's last session: answers to my proposals, weddings and
   * divorces they filed, break-ups, deaths, and children we share. Runs once per session.
   */
  reconcile(ctx: SimulationContext): Promise<void> {
    return ctx.memo(RECONCILE_KEY, () => this.runReconcile(ctx));
  }

  /** The character died: cancel pending proposals, widow a player spouse and tell partners. */
  async onDeath(ctx: SimulationContext): Promise<void> {
    const me = ctx.character.id;
    await ctx.manager.update(ProposalEntity, { fromCharacterId: me, status: 'pending' }, { status: 'cancelled', proposerSynced: true, respondedAtGame: ctx.time });
    await ctx.manager.update(ProposalEntity, { toCharacterId: me, status: 'pending' }, { status: 'cancelled', proposerSynced: false, respondedAtGame: ctx.time });

    const marriage = await this.marriages.active(ctx);
    if (marriage) await this.marriages.end(ctx, marriage, 'widowed');

    const graph = await this.relationships.graph(ctx);
    const name = fullName(ctx.character);
    for (const rel of graph.relationships) {
      if (!rel.otherCharacterId || !identityOf(graph, rel).alive) continue;
      if (isRomanticKind(rel.kind)) {
        await this.notifier.notify(ctx, rel.otherCharacterId, {
          kind: 'relationship',
          title: `💔 ${ctx.character.firstName} has passed away`,
          body: rel.kind === 'spouse' ? `Your spouse ${name} has died. You are now widowed. Sun re o.` : `${name} has died. Sun re o.`,
          tone: 'bad',
        });
      } else if (isFamilyKind(rel.kind)) {
        await this.notifier.notify(ctx, rel.otherCharacterId, { kind: 'family', title: `${ctx.character.firstName} has passed on`, body: `${name} has died. The family is gathering.`, tone: 'bad' });
      }
    }
  }

  private async runReconcile(ctx: SimulationContext): Promise<void> {
    const graph = await this.relationships.graph(ctx);
    const changed = new Set<RelationshipEntity>();
    await this.applyAnswers(ctx, graph, changed);
    await this.applyMarriages(ctx, graph, changed);
    await this.applyBreakUps(ctx, graph, changed);
    await this.applySocialFriendships(ctx, graph, changed);
    await this.adoptSharedChildren(ctx);
    if (changed.size > 0) {
      await this.relationships.save(ctx, ...changed);
      this.relationships.householdChanged(ctx);
    }
  }

  private async applyAnswers(ctx: SimulationContext, graph: FamilyGraph, changed: Set<RelationshipEntity>): Promise<void> {
    const answered = await ctx.manager.find(ProposalEntity, {
      where: { fromCharacterId: ctx.character.id, proposerSynced: false },
      order: { respondedAtGame: 'ASC' },
    });
    for (const proposal of answered) {
      const rel = await this.ensureRel(ctx, graph, proposal.toCharacterId);
      const name = identityOf(graph, rel).firstName;
      if (proposal.status === 'accepted') {
        switch (proposal.kind) {
          case 'friend':
            if (rel.kind === 'acquaintance' || rel.kind === 'ex') this.promoteToFriend(rel, ctx.time);
            break;
          case 'date':
            if (!isRomanticKind(rel.kind)) this.relationships.changeKind(rel, 'partner', proposal.respondedAtGame ?? ctx.time);
            this.raise(rel, ctx.time, 40, 35);
            addMood(ctx, 'romance:date-yes', `${name} said yes`, 8, 3);
            break;
          case 'marriage':
            if (rel.kind === 'partner') this.relationships.changeKind(rel, 'fiance', proposal.respondedAtGame ?? ctx.time);
            this.relationships.setFlags(rel, { ringValue: proposal.ringValue });
            addMood(ctx, 'romance:engaged', `Engaged to ${name}`, 15, 7);
            break;
          case 'baby':
            await this.romance.conceiveAfterConsent(ctx, fullName(identityOf(graph, rel)), proposal.id);
            break;
        }
      } else {
        await this.applyRejection(ctx, graph, rel, proposal);
      }
      changed.add(rel);
      proposal.proposerSynced = true;
      await ctx.manager.save(ProposalEntity, proposal);
    }
  }

  private async applyRejection(ctx: SimulationContext, graph: FamilyGraph, rel: RelationshipEntity, proposal: ProposalEntity): Promise<void> {
    const name = identityOf(graph, rel).firstName;
    if (proposal.ringValue > 0) {
      const refund = Math.round(proposal.ringValue * RING_BUYBACK);
      await ctx.wallet.receive(refund, 'refund', `Jeweller bought back the ring for ${name}`, `proposal-ring-buyback:${proposal.id}`, { income: 'neutral' });
    }
    if (proposal.status !== 'declined') return;
    if (proposal.kind === 'marriage') {
      this.relationships.touch(graph, rel, ctx.time, { romance: -20 });
      addMood(ctx, 'heartbreak', `${name} said no`, -15, 5);
    } else if (proposal.kind === 'date') {
      this.relationships.touch(graph, rel, ctx.time, { romance: -10 });
      addMood(ctx, 'heartbreak', `${name} said no`, -5, 2);
    } else if (proposal.kind === 'friend') {
      this.relationships.touch(graph, rel, ctx.time, { closeness: -3 });
    }
  }

  private async applyMarriages(ctx: SimulationContext, graph: FamilyGraph, changed: Set<RelationshipEntity>): Promise<void> {
    const me = ctx.character.id;
    for (const marriage of await this.marriages.playerMarriages(ctx)) {
      const otherId = marriage.characterId === me ? marriage.spouseCharacterId : marriage.characterId;
      if (!otherId) continue;
      const rel = await this.ensureRel(ctx, graph, otherId);
      if (marriage.status === 'active' && rel.kind !== 'spouse') {
        this.relationships.changeKind(rel, 'spouse', marriage.marriedAt);
        this.relationships.setFlags(rel, { traditionalDone: marriage.traditional || undefined, whiteWeddingDone: marriage.weddingTier ? true : undefined });
        changed.add(rel);
      } else if (marriage.status === 'divorced' && rel.kind === 'spouse') {
        this.relationships.changeKind(rel, 'ex', marriage.endedAt ?? ctx.time);
        this.relationships.setFlags(rel, { endedBy: 'them' });
        changed.add(rel);
      }
    }
  }

  private async applyBreakUps(ctx: SimulationContext, graph: FamilyGraph, changed: Set<RelationshipEntity>): Promise<void> {
    const romantic = graph.relationships.filter((rel) => rel.otherCharacterId && (rel.kind === 'partner' || rel.kind === 'fiance'));
    if (romantic.length === 0) return;
    const theirs = await ctx.manager.find(RelationshipEntity, {
      where: { characterId: In(romantic.map((rel) => rel.otherCharacterId ?? '')), otherCharacterId: ctx.character.id },
      select: { id: true, characterId: true, kind: true },
    });
    for (const rel of romantic) {
      const other = theirs.find((row) => row.characterId === rel.otherCharacterId);
      const alive = identityOf(graph, rel).alive;
      if (alive && other?.kind !== 'ex') continue;
      this.relationships.changeKind(rel, 'ex', ctx.time);
      this.relationships.setFlags(rel, { endedBy: alive ? 'them' : 'death' });
      changed.add(rel);
    }
  }

  /** Friend requests accepted in the social domain make acquaintances friends here too. */
  private async applySocialFriendships(ctx: SimulationContext, graph: FamilyGraph, changed: Set<RelationshipEntity>): Promise<void> {
    for (const rel of graph.relationships) {
      if (!rel.otherCharacterId || rel.kind !== 'acquaintance') continue;
      if (!(await this.guard.areFriends(ctx.character.id, rel.otherCharacterId, ctx.manager))) continue;
      this.promoteToFriend(rel, ctx.time);
      changed.add(rel);
    }
  }

  private async befriend(ctx: SimulationContext, graph: FamilyGraph, rel: RelationshipEntity | null, otherCharacterId: string): Promise<RelationshipEntity> {
    const target = rel ?? (await this.ensureRel(ctx, graph, otherCharacterId));
    if (target.kind === 'acquaintance') {
      this.promoteToFriend(target, ctx.time);
      await this.relationships.save(ctx, target);
    }
    return target;
  }

  private promoteToFriend(rel: RelationshipEntity, t: number): void {
    rel.kind = 'friend';
    rel.closeness = Math.max(this.relationships.closeness(rel, t), 30);
    rel.lastContactAt = t;
  }

  /** Children a player partner gave birth to show up in my family too. */
  private async adoptSharedChildren(ctx: SimulationContext): Promise<void> {
    const me = ctx.character.id;
    const rows = (await ctx.manager.query(
      `SELECT p.id FROM family_people p
        WHERE p.parent_character_ids @> $1::jsonb
          AND NOT EXISTS (SELECT 1 FROM family_relationships r WHERE r.character_id = $2 AND r.person_id = p.id)`,
      [JSON.stringify([me]), me],
    )) as Array<{ id: string }>;
    if (rows.length === 0) return;
    const people = await ctx.manager.find(PersonEntity, { where: { id: In(rows.map((row) => row.id)) } });
    const graph = await this.relationships.graph(ctx);
    for (const person of people) {
      graph.people.set(person.id, person);
      await this.relationships.create(ctx, { personId: person.id, kind: 'child', closeness: 75, metAt: 'family', since: person.bornAt });
    }
    this.relationships.householdChanged(ctx);
  }

  private async applyAccepted(ctx: SimulationContext, graph: FamilyGraph, rel: RelationshipEntity, proposal: ProposalEntity, proposer: PlayerRef): Promise<string> {
    switch (proposal.kind) {
      case 'friend':
        if (rel.kind === 'acquaintance' || rel.kind === 'ex') this.promoteToFriend(rel, ctx.time);
        return '';
      case 'date':
        if (!isRomanticKind(rel.kind)) this.relationships.changeKind(rel, 'partner', ctx.time);
        this.raise(rel, ctx.time, 40, 35);
        await this.cancelOtherRomanticProposals(ctx, proposer.id);
        this.relationships.householdChanged(ctx);
        return '';
      case 'marriage':
        this.relationships.changeKind(rel, 'fiance', ctx.time);
        this.relationships.setFlags(rel, { ringValue: proposal.ringValue });
        this.relationships.touch(graph, rel, ctx.time, { romance: 10 });
        addMood(ctx, 'romance:engaged', `Engaged to ${proposer.firstName}`, 15, 7);
        this.relationships.householdChanged(ctx);
        return '';
      case 'baby': {
        const conceived = await this.romance.conceiveAfterConsent(ctx, fullName(proposer), proposal.id);
        return conceived ? 'And… it worked! 🤰' : '';
      }
    }
  }

  private async assertCanPropose(ctx: SimulationContext, graph: FamilyGraph, rel: RelationshipEntity | null, other: PlayerRef, kind: ProposalKind, options: ProposalOptions): Promise<void> {
    if (rel && isFamilyKind(rel.kind)) throw new GameRuleException('FAMILY', 'Ah ah! That’s family.');
    const romantic = kind !== 'friend';
    const otherAge = yearsBetween(other.bornAt, ctx.time);
    if (romantic && (ctx.age < 18 || otherAge < 18)) throw new GameRuleException('TOO_YOUNG', 'Romance is for 18+. Face your books.');
    const closeness = rel ? this.relationships.closeness(rel, ctx.time) : 0;
    const romance = rel ? this.relationships.romance(rel, ctx.time) : 0;
    switch (kind) {
      case 'friend':
        if (rel && rel.kind !== 'acquaintance' && rel.kind !== 'ex') throw new GameRuleException('ALREADY_FRIENDS', `You and ${other.firstName} are already close.`);
        return;
      case 'date': {
        if (!rel || (rel.kind !== 'friend' && rel.kind !== 'ex')) throw new GameRuleException('NOT_FRIENDS', `Be friends with ${other.firstName} first.`);
        if (closeness < 20) throw new GameRuleException('NOT_CLOSE_ENOUGH', `You and ${other.firstName} aren’t that close yet (closeness ${Math.round(closeness)}/20).`);
        const partner = currentPartner(graph);
        if (partner && partner.id !== rel.id) throw new GameRuleException('ALREADY_TAKEN', 'You’re already with someone. Lagos is small o — finish that first.');
        if (await MarriagesService.activeFor(ctx.manager, other.id)) throw new GameRuleException('PARTNER_MARRIED', `${other.firstName} is married.`);
        return;
      }
      case 'marriage': {
        if (rel?.kind !== 'partner') throw new GameRuleException('NOT_DATING', `You can only propose to someone you’re dating.`);
        const days = RelationshipsService.daysSince(rel.flags.datingSince, ctx.time);
        if (days < 30) throw new GameRuleException('TOO_SOON', `You’ve only been dating for ${days} days. Mummy said take it slow (30+ days).`);
        if (romance < 70) throw new GameRuleException('NO_SPARK', `There isn’t enough spark yet (romance ${Math.round(romance)}/70).`);
        const ring = options.ringValue;
        if (ring === undefined || !Number.isInteger(ring) || ring < RING_LIMITS.min || ring > RING_LIMITS.max) {
          throw new GameRuleException('INVALID_AMOUNT', `Pick a ring between ${formatNaira(RING_LIMITS.min)} and ${formatNaira(RING_LIMITS.max)}.`);
        }
        return;
      }
      case 'baby': {
        if (!rel || !isRomanticKind(rel.kind)) throw new GameRuleException('NOT_ALLOWED', `You need to be in a relationship with ${other.firstName} for that.`);
        if (other.gender === ctx.character.gender) throw new GameRuleException('BIOLOGY', 'Biology says no. Adoption is coming in a future update.');
        const womanAge = ctx.character.gender === 'female' ? ctx.age : otherAge;
        if (womanAge > MAX_FERTILE_AGE) throw new GameRuleException('FERTILITY', 'That ship has sailed — enjoy the grandchildren instead.');
        return;
      }
    }
  }

  private assertCanAccept(ctx: SimulationContext, graph: FamilyGraph, rel: RelationshipEntity | null, proposer: PlayerRef, proposal: ProposalEntity): void {
    if (proposal.kind === 'friend') return;
    const partner = currentPartner(graph);
    const elsewhere = partner && partner.otherCharacterId !== proposer.id;
    if ((proposal.kind === 'date' || proposal.kind === 'marriage') && elsewhere) {
      throw new GameRuleException('ALREADY_TAKEN', 'You’re already with someone else. Lagos is small o.');
    }
    if (proposal.kind === 'marriage' && rel?.kind !== 'partner') throw new GameRuleException('NOT_DATING', `You’re not dating ${proposer.firstName} any more.`);
    if (proposal.kind === 'baby' && (!rel || !isRomanticKind(rel.kind))) throw new GameRuleException('NOT_ALLOWED', `You’re not with ${proposer.firstName} any more.`);
    if (proposal.kind !== 'baby' && ctx.age < 18) throw new GameRuleException('TOO_YOUNG', 'Romance is for 18+.');
  }

  private async cancelOtherRomanticProposals(ctx: SimulationContext, exceptCharacterId: string): Promise<void> {
    const pending = await ctx.manager.find(ProposalEntity, { where: { fromCharacterId: ctx.character.id, status: 'pending', kind: In([...ROMANTIC_PROPOSALS]) } });
    for (const proposal of pending) {
      if (proposal.toCharacterId === exceptCharacterId) continue;
      proposal.status = 'cancelled';
      proposal.respondedAtGame = ctx.time;
      proposal.proposerSynced = proposal.ringValue === 0;
      await ctx.manager.save(ProposalEntity, proposal);
    }
  }

  private raise(rel: RelationshipEntity, t: number, romance: number, closeness: number): void {
    rel.romance = Math.max(this.relationships.romance(rel, t), romance);
    rel.closeness = Math.max(this.relationships.closeness(rel, t), closeness);
    rel.lastContactAt = t;
    rel.lastRomanceAt = t;
  }

  private async ensureRel(ctx: SimulationContext, graph: FamilyGraph, otherCharacterId: string): Promise<RelationshipEntity> {
    return (
      graph.relationships.find((rel) => rel.otherCharacterId === otherCharacterId) ??
      (await this.relationships.create(ctx, { otherCharacterId, kind: 'acquaintance', closeness: 10, metAt: 'online' }))
    );
  }

  private async findPlayer(ctx: SimulationContext, target: ProposalTarget): Promise<PlayerRef> {
    const where = 'handle' in target ? { handle: target.handle.trim().toLowerCase().replace(/^@/, '') } : { id: target.characterId };
    const row = await ctx.manager.findOne(CharacterEntity, { where: { ...where, hiddenAt: IsNull() }, select: { id: true } });
    const [player] = row ? await this.relationships.loadPlayers(ctx, [row.id]) : [];
    if (!player || !player.alive) throw new ResourceNotFoundException('Player');
    if (player.id === ctx.character.id) throw new GameRuleException('SELF', 'Love yourself — but not like this.');
    return player;
  }

  /** Which of these characters are hidden (their account was deleted). */
  private async hidden(ctx: SimulationContext, ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await ctx.manager.find(CharacterEntity, { where: { id: In([...ids]), hiddenAt: Not(IsNull()) }, select: { id: true } });
    return new Set(rows.map((row) => row.id));
  }

  private self(ctx: SimulationContext): PlayerRef {
    const c = ctx.character;
    return {
      id: c.id,
      userId: c.userId,
      handle: c.handle,
      firstName: c.firstName,
      lastName: c.lastName,
      gender: c.gender,
      stateOfOrigin: c.stateOfOrigin,
      bornAt: c.bornAt,
      alive: c.alive,
      diedAt: c.diedAt,
      locationId: c.locationId,
    };
  }

  private answerCopy(kind: ProposalKind, accept: boolean, name: string): { readonly title: string; readonly body: string } {
    if (!accept) {
      const declined: Record<ProposalKind, string> = {
        friend: `${name} declined your friend request.`,
        date: `${name} said “let’s just be friends”.`,
        marriage: `${name} said no to your proposal. The jeweller will buy the ring back at 60%.`,
        baby: `${name} says not now.`,
      };
      return { title: `${name} said no`, body: declined[kind] };
    }
    const accepted: Record<ProposalKind, string> = {
      friend: `You and ${name} are now friends.`,
      date: `You and ${name} are officially dating! 🌹`,
      marriage: `${name} said YES! You’re engaged. 💍`,
      baby: `${name} is on board. Fingers crossed.`,
    };
    return { title: `${name} said yes!`, body: accepted[kind] };
  }

  private toDto(proposal: ProposalEntity, from: PlayerRef, to: PlayerRef): ProposalDto {
    return {
      id: proposal.id,
      kind: proposal.kind,
      status: proposal.status,
      from: proposalParty(from),
      to: proposalParty(to),
      message: proposal.message,
      ringValue: proposal.ringValue,
      createdAt: proposal.createdAtGame,
      respondedAt: proposal.respondedAtGame,
    };
  }
}

const proposalParty = (player: PlayerRef): ProposalDto['from'] => ({ characterId: player.id, handle: player.handle, name: fullName(player) });
