import {
  FUNERALS,
  MINUTES_PER_DAY,
  NAMING_CEREMONIES,
  dayIndexOf,
  ethnicityOfState,
  formatNaira,
  generateName,
  yearsBetween,
  type BackgroundId,
  type FuneralTier,
  type NamingCeremonyTier,
} from '@insidelife/shared';
import type { LifeEventChoice, LifeEventDefinition, LifeEventOutcome, LifeEventParams } from '../events/interfaces/life-event.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { RelationshipEntity } from './entities/relationship.entity.js';
import { addMood, adjustConnections, adjustStatus, boostNeeds } from './family.util.js';
import { currentPartner, familyTitle, fullName, identityOf, relationshipsOfKind, type FamilyGraph } from './interfaces/family-graph.js';
import { attendsSchool } from './rules/school.rules.js';
import { BLACK_TAX_EVENT, BlackTaxService } from './services/black-tax.service.js';
import { ChildrenService } from './services/children.service.js';
import { FamilyTriggersService } from './services/family-triggers.service.js';
import { HouseholdService } from './services/household.service.js';
import { PeopleService } from './services/people.service.js';
import { RelationshipsService } from './services/relationships.service.js';

export interface FamilyEventDeps {
  readonly relationships: RelationshipsService;
  readonly people: PeopleService;
  readonly children: ChildrenService;
  readonly household: HouseholdService;
  readonly blackTax: BlackTaxService;
  readonly triggers: FamilyTriggersService;
}

/** Queued family facts beat random cards when the daily event is dealt. */
const TRIGGERED_WEIGHT = 60;
const TWO_DAYS = 2 * MINUTES_PER_DAY;

/** The village land sale pays out by how much the family has (₦ range). */
const LAND_SHARE: Readonly<Record<BackgroundId, readonly [number, number]>> = {
  'sapa-pikin': [150_000, 400_000],
  'working-class': [300_000, 900_000],
  ajebota: [1_000_000, 3_000_000],
  'nepo-baby': [5_000_000, 15_000_000],
};

const OWAMBE_OCCASIONS = ['daughter’s wedding', '60th birthday', 'house warming', 'chieftaincy celebration', 'father’s 80th'] as const;
const OWAMBE_HOSTS = ['Chief', 'Alhaji', 'Mrs', 'Dr', 'Engr', 'Lady'] as const;
const PTA_REASONS = ['the new borehole', 'inter-house sports', 'generator diesel', 'the end-of-year party', '“development”'] as const;

const num = (params: LifeEventParams, key: string): number => Number(params[key] ?? 0);
const str = (params: LifeEventParams, key: string): string => String(params[key] ?? '');
const naira = (params: LifeEventParams, key: string): string => formatNaira(num(params, key));
const afford =
  (key: string) =>
  (ctx: SimulationContext, params: LifeEventParams): string | null =>
    ctx.wallet.canAfford(num(params, key)) ? null : `You don’t have ${naira(params, key)}`;
const payKey = (eventId: string, params: LifeEventParams, choice: string): string =>
  `family-event:${eventId}:${str(params, 'triggerId') || str(params, 'token')}:${choice}`;
const alive = (g: FamilyGraph, rel: RelationshipEntity): boolean => identityOf(g, rel).alive;
/** Day of the 360-day game year. */
const dayOfYear = (t: number): number => dayIndexOf(t) % 360;

/** Pay the amount stored under `key` in the card's params (deterministic ledger key per card and choice). */
async function spend(
  ctx: SimulationContext,
  params: LifeEventParams,
  eventId: string,
  choice: string,
  key: string,
  kind: 'ceremony' | 'purchase' | 'family-support' | 'school-fees',
  memo: string,
): Promise<number> {
  const amount = num(params, key);
  await ctx.wallet.pay(amount, kind, memo, payKey(eventId, params, choice));
  return amount;
}

/** Life-event cards owned by the family domain. */
export function familyEvents(deps: FamilyEventDeps): LifeEventDefinition[] {
  const { relationships, people, children, household, blackTax, triggers } = deps;

  const graph = (ctx: SimulationContext): Promise<FamilyGraph> => relationships.graph(ctx);
  const nudge = async (ctx: SimulationContext, rels: readonly RelationshipEntity[], closeness: number, romance?: number): Promise<void> => {
    const g = await graph(ctx);
    for (const rel of rels) relationships.touch(g, rel, ctx.time, { closeness, romance });
    await relationships.save(ctx, ...rels);
  };
  const byId = async (ctx: SimulationContext, id: string): Promise<RelationshipEntity | undefined> => (id ? relationships.find(await graph(ctx), id) : undefined);
  const elders = async (ctx: SimulationContext): Promise<RelationshipEntity[]> => {
    const g = await graph(ctx);
    return relationshipsOfKind(g, 'father', 'mother', 'sibling').filter((rel) => alive(g, rel));
  };
  const partnerNpc = async (ctx: SimulationContext): Promise<RelationshipEntity | null> => {
    const g = await graph(ctx);
    const partner = currentPartner(g);
    return partner && identityOf(g, partner).person ? partner : null;
  };

  const triggered = (
    definition: Omit<LifeEventDefinition, 'domain' | 'weight' | 'cooldownDays' | 'eligible' | 'prepare'>,
  ): LifeEventDefinition => ({
    ...definition,
    domain: 'family',
    weight: TRIGGERED_WEIGHT,
    cooldownDays: 0,
    eligible: (ctx) => triggers.has(ctx, definition.id),
    prepare: (ctx) => triggers.take(ctx, definition.id),
  });

  // ----- Queued by the family system -----------------------------------------------------------------------------

  const blackTaxChoice = (id: 'pay-all' | 'pay-part' | 'pray', label: (p: LifeEventParams) => string, hint: string, amountKey?: string): LifeEventChoice => ({
    id,
    label,
    hint: () => hint,
    unavailable: amountKey ? afford(amountKey) : undefined,
    resolve: (ctx, params) => blackTax.resolve(ctx, params, id),
  });

  const blackTaxCard = triggered({
    id: BLACK_TAX_EVENT,
    art: '📞',
    expiresIn: TWO_DAYS,
    title: (p) => blackTax.title(p),
    body: (p) => blackTax.body(p),
    choices: [
      blackTaxChoice('pay-all', (p) => `Send ${naira(p, 'amount')}`, 'Family hero', 'amount'),
      blackTaxChoice('pay-part', (p) => `Send ${naira(p, 'partAmount')}`, 'Something small', 'partAmount'),
      blackTaxChoice('pray', () => '“I’ll pray for you”', 'They will talk'),
    ],
    defaultChoiceId: 'pray',
  });

  const funeralOutcome = async (ctx: SimulationContext, params: LifeEventParams, closeness: number, status: number): Promise<void> => {
    await nudge(ctx, await elders(ctx), closeness);
    adjustStatus(ctx, status);
  };
  const funeralCard = triggered({
    id: 'family-funeral',
    art: '🕊️',
    expiresIn: 3 * MINUTES_PER_DAY,
    title: (p) => `Burial arrangements for ${str(p, 'name')}`,
    body: (p) =>
      `The family is planning a ${FUNERALS[str(p, 'funeralTier') as FuneralTier]?.label.toLowerCase() ?? 'burial'} (${str(p, 'totalLabel')}) for ${str(p, 'title')}. ` +
      `At the family meeting, everyone looked at you: your share is ${naira(p, 'expected')}.`,
    choices: [
      {
        id: 'contribute',
        label: (p) => `Contribute ${naira(p, 'expected')}`,
        hint: () => 'Do your part',
        unavailable: afford('expected'),
        resolve: async (ctx, p) => {
          const amount = await spend(ctx, p, 'family-funeral', 'contribute', 'expected', 'ceremony', `Burial contribution for ${str(p, 'name')}`);
          await funeralOutcome(ctx, p, 6, 3);
          return { title: 'A befitting send-off', body: 'The canopies were full and the jollof didn’t finish. You did well.', tone: 'good', moneyDelta: -amount };
        },
      },
      {
        id: 'modest',
        label: (p) => `Contribute ${naira(p, 'modest')}`,
        hint: () => 'What you can afford',
        unavailable: afford('modest'),
        resolve: async (ctx, p) => {
          const amount = await spend(ctx, p, 'family-funeral', 'modest', 'modest', 'ceremony', `Burial contribution for ${str(p, 'name')}`);
          await funeralOutcome(ctx, p, 1, 0);
          return { title: 'You did what you could', body: 'Your siblings noticed the amount. Nobody said anything. Yet.', tone: 'neutral', moneyDelta: -amount };
        },
      },
      {
        id: 'none',
        label: () => '“I don’t have it right now”',
        hint: () => 'The family will remember',
        resolve: async (ctx, p) => {
          await funeralOutcome(ctx, p, -8, -4);
          return { title: 'The family is not happy', body: 'Your name came up at the family meeting. Not in a good way.', tone: 'bad', moneyDelta: 0 };
        },
      },
    ],
    defaultChoiceId: 'none',
  });

  const namingChoice = (tier: NamingCeremonyTier): LifeEventChoice => ({
    id: tier,
    label: (p) => `${NAMING_CEREMONIES[tier].label} (${naira(p, tier)})`,
    hint: () => NAMING_CEREMONIES[tier].blurb,
    unavailable: afford(tier),
    resolve: async (ctx, p) => {
      const amount = await spend(ctx, p, 'family-naming-ceremony', tier, tier, 'ceremony', `${NAMING_CEREMONIES[tier].label} for ${str(p, 'childName')}`);
      adjustStatus(ctx, NAMING_CEREMONIES[tier].status);
      addMood(ctx, 'naming-ceremony', `${str(p, 'childName')}’s naming ceremony`, tier === 'prayers' ? 4 : 10, 3);
      const g = await graph(ctx);
      await nudge(ctx, relationshipsOfKind(g, 'father', 'mother').filter((rel) => alive(g, rel)), tier === 'prayers' ? 2 : 5);
      return {
        title: `Welcome, ${str(p, 'fullName')}`,
        body: tier === 'prayers' ? 'Honey for sweetness, salt for flavour, bitter kola for long life. Beautiful.' : 'The DJ played Asa and the aunties danced. A day to remember.',
        tone: 'good',
        moneyDelta: -amount,
      };
    },
  });
  const namingCard = triggered({
    id: 'family-naming-ceremony',
    art: '👶',
    expiresIn: 3 * MINUTES_PER_DAY,
    title: (p) => `Naming ceremony for ${str(p, 'childName')}`,
    body: (p) => `On the eighth day, family and friends gather to name ${str(p, 'fullName')}. How big should it be?`,
    choices: [namingChoice('grand'), namingChoice('standard'), namingChoice('intimate'), namingChoice('prayers')],
    defaultChoiceId: 'prayers',
  });

  const sentHomeCard = triggered({
    id: 'family-child-sent-home',
    art: '🎒',
    expiresIn: TWO_DAYS,
    title: (p) => `${str(p, 'childName')} was sent home`,
    body: (p) => `${str(p, 'school')} wants ${naira(p, 'fee')} before ${str(p, 'childName')} can come back. The other parents are looking at you at pick-up.`,
    choices: [
      {
        id: 'pay',
        label: (p) => `Pay ${naira(p, 'fee')}`,
        unavailable: afford('fee'),
        resolve: async (ctx, p) => {
          const paid = await children.readmit(ctx, str(p, 'childId'), num(p, 'fee'), num(p, 'term'));
          return paid
            ? { title: `${str(p, 'childName')} is back in class`, body: 'Receipt collected, uniform ironed. Crisis averted.', tone: 'good', moneyDelta: -num(p, 'fee') }
            : { title: 'Payment failed', body: 'The money wasn’t there.', tone: 'bad', moneyDelta: 0 };
        },
      },
      {
        id: 'public',
        label: (p) => `Move to public school (${naira(p, 'publicFee')}/term)`,
        hint: () => 'Cheaper, bigger classes',
        resolve: async (ctx, p) => {
          await children.moveToPublic(ctx, str(p, 'childId'));
          addMood(ctx, 'school-downgrade', 'Changed schools', -3, 3);
          return { title: 'New school, new friends', body: `${str(p, 'childName')} starts at the public school on Monday. Fewer French lessons, more character.`, tone: 'neutral', moneyDelta: 0 };
        },
      },
      {
        id: 'beg',
        label: () => 'Beg the proprietor',
        hint: () => 'Charm required',
        resolve: async (ctx, p): Promise<LifeEventOutcome> => {
          const chance = 0.25 + ctx.character.skills.charisma / 200;
          if (ctx.rng('proprietor', str(p, 'childId'), num(p, 'term')).chance(chance)) {
            const g = await graph(ctx);
            const child = g.people.get(str(p, 'childId'));
            if (child) {
              child.sentHomeTerm = null;
              await relationships.savePeople(ctx, child);
            }
            return { title: 'The proprietor softened', body: `“Pay before exams o.” ${str(p, 'childName')} is back in class — this term is on credit.`, tone: 'good', moneyDelta: 0 };
          }
          addMood(ctx, 'proprietor-shame', 'Embarrassed at school', -3, 2);
          return { title: 'No dice', body: '“Madam/Sir, we also have salaries to pay.” Your child stays home.', tone: 'bad', moneyDelta: 0 };
        },
      },
    ],
    defaultChoiceId: 'beg',
  });

  // ----- Random family life --------------------------------------------------------------------------------------

  const asoEbiCard: LifeEventDefinition = {
    id: 'family-sibling-aso-ebi',
    domain: 'family',
    art: '👗',
    weight: 5,
    cooldownDays: 120,
    eligible: async (ctx) => {
      if (ctx.age < 18) return false;
      const g = await graph(ctx);
      return relationshipsOfKind(g, 'sibling').some((rel) => {
        const identity = identityOf(g, rel);
        const age = yearsBetween(identity.bornAt, ctx.time);
        return identity.alive && age >= 22 && age <= 45 && (identity.person?.available ?? false);
      });
    },
    prepare: async (ctx) => {
      const g = await graph(ctx);
      const rng = ctx.rng('aso-ebi', dayIndexOf(ctx.time));
      const options = relationshipsOfKind(g, 'sibling').filter((rel) => {
        const identity = identityOf(g, rel);
        const age = yearsBetween(identity.bornAt, ctx.time);
        return identity.alive && age >= 22 && age <= 45 && (identity.person?.available ?? false);
      });
      const sibling = rng.pick(options);
      const identity = identityOf(g, sibling);
      const fabric = ctx.world.price(rng.int(35, 85) * 1_000, ctx.time);
      const tailoring = ctx.world.price(25_000, ctx.time);
      return {
        token: ctx.time,
        siblingId: sibling.id,
        name: identity.firstName,
        relation: identity.gender === 'male' ? 'brother' : 'sister',
        full: fabric + tailoring,
        cap: ctx.world.price(15_000, ctx.time),
      };
    },
    title: (p) => `${str(p, 'name')}’s wedding: aso-ebi alert`,
    body: (p) => `Your ${str(p, 'relation')} ${str(p, 'name')} is getting married! The aso-ebi committee says fabric and tailoring come to ${naira(p, 'full')}. Colour: “champagne gold”.`,
    choices: [
      {
        id: 'full',
        label: (p) => `Buy aso-ebi and sew it (${naira(p, 'full')})`,
        unavailable: afford('full'),
        resolve: async (ctx, p) => {
          const amount = await spend(ctx, p, 'family-sibling-aso-ebi', 'full', 'full', 'purchase', `Aso-ebi for ${str(p, 'name')}’s wedding`);
          await siblingMarried(ctx, p, 8);
          adjustStatus(ctx, 2);
          boostNeeds(ctx, { fun: 20, social: 25 });
          return { title: 'You looked the part', body: 'Front row in matching aso-ebi. The photographer loved you.', tone: 'good', moneyDelta: -amount };
        },
      },
      {
        id: 'cap',
        label: (p) => `Just the ${str(p, 'relation') === 'sister' ? 'gele' : 'cap'} (${naira(p, 'cap')})`,
        unavailable: afford('cap'),
        resolve: async (ctx, p) => {
          const amount = await spend(ctx, p, 'family-sibling-aso-ebi', 'cap', 'cap', 'purchase', `Aso-ebi accessories for ${str(p, 'name')}’s wedding`);
          await siblingMarried(ctx, p, 2);
          return { title: 'Half aso-ebi', body: 'Matching on top, freestyle at the bottom. It counts.', tone: 'neutral', moneyDelta: -amount };
        },
      },
      {
        id: 'skip',
        label: () => '“I’ll wear what I have”',
        resolve: async (ctx, p) => {
          await siblingMarried(ctx, p, -6);
          return { title: 'Odd one out', body: 'Every family photo: everyone in gold, you in blue. Forever.', tone: 'bad', moneyDelta: 0 };
        },
      },
    ],
    defaultChoiceId: 'skip',
  };
  async function siblingMarried(ctx: SimulationContext, params: LifeEventParams, closeness: number): Promise<void> {
    const rel = await byId(ctx, str(params, 'siblingId'));
    if (!rel) return;
    await nudge(ctx, [rel], closeness);
    const person = identityOf(await graph(ctx), rel).person;
    if (person) {
      person.available = false;
      await relationships.savePeople(ctx, person);
    }
  }

  const spouseNudge = async (ctx: SimulationContext, romance: number, closeness: number): Promise<string> => {
    const partner = await partnerNpc(ctx);
    if (!partner) return 'your spouse';
    await nudge(ctx, [partner], closeness, romance);
    return identityOf(await graph(ctx), partner).firstName;
  };
  const inLawCard: LifeEventDefinition = {
    id: 'family-mother-in-law',
    domain: 'family',
    art: '👵',
    weight: 4,
    cooldownDays: 120,
    eligible: async (ctx) => (await household.state(ctx)).status === 'married' && (await partnerNpc(ctx)) !== null,
    prepare: async (ctx) => {
      const partner = await partnerNpc(ctx);
      const name = partner ? identityOf(await graph(ctx), partner).firstName : 'your spouse';
      return { token: ctx.time, spouse: name, host: ctx.world.price(60_000, ctx.time), gifts: ctx.world.price(100_000, ctx.time) };
    },
    title: () => 'Mother-in-law is visiting',
    body: (p) => `Mama ${str(p, 'spouse')} is coming to stay for “two weeks”. She has already asked why the house is so quiet (translation: where are the grandchildren?).`,
    choices: [
      {
        id: 'host',
        label: (p) => `Host her well (${naira(p, 'host')})`,
        unavailable: afford('host'),
        resolve: async (ctx, p) => {
          const amount = await spend(ctx, p, 'family-mother-in-law', 'host', 'host', 'purchase', 'Groceries for mother-in-law’s visit');
          const name = await spouseNudge(ctx, 8, 5);
          return { title: 'Best in-law of the year', body: `She told the whole church about you. ${name} is very pleased.`, tone: 'good', moneyDelta: -amount };
        },
      },
      {
        id: 'gifts',
        label: (p) => `Send her home early with gifts (${naira(p, 'gifts')})`,
        unavailable: afford('gifts'),
        resolve: async (ctx, p) => {
          const amount = await spend(ctx, p, 'family-mother-in-law', 'gifts', 'gifts', 'purchase', 'Gifts for mother-in-law');
          await spouseNudge(ctx, 5, 2);
          return { title: 'Diplomacy', body: 'Wrappers, a new phone and a “God bless you, my child”. She left after four days. Happy.', tone: 'good', moneyDelta: -amount };
        },
      },
      {
        id: 'complain',
        label: () => '“Two weeks is too long”',
        resolve: async (ctx) => {
          const name = await spouseNudge(ctx, -10, -5);
          addMood(ctx, 'in-law-wahala', 'In-law wahala', -3, 3);
          return { title: 'Cold war at home', body: `${name} is not talking to you. The soup has no meat in it.`, tone: 'bad', moneyDelta: 0 };
        },
      },
    ],
    defaultChoiceId: 'complain',
  };

  const someoneHomeCard: LifeEventDefinition = {
    id: 'family-bring-someone-home',
    domain: 'family',
    art: '👀',
    weight: 4,
    cooldownDays: 60,
    eligible: async (ctx) => {
      if (ctx.age < 27) return false;
      const g = await graph(ctx);
      return currentPartner(g) === null && relationshipsOfKind(g, 'mother', 'father').some((rel) => alive(g, rel));
    },
    prepare: async (ctx) => {
      const g = await graph(ctx);
      const parent = relationshipsOfKind(g, 'mother', 'father').find((rel) => alive(g, rel));
      return { token: ctx.time, parent: parent ? familyTitle(parent.kind, identityOf(g, parent)) : 'Mummy', parentId: parent?.id ?? '' };
    },
    title: () => '“When are you bringing someone home?”',
    body: (p) => `${str(p, 'parent')} called again. “Your mates are carrying babies. Mrs Adeyemi’s daughter is getting married. And you?”`,
    choices: [
      {
        id: 'soon',
        label: () => '“Soon, Ma/Sir”',
        resolve: async (ctx, p) => {
          const rel = await byId(ctx, str(p, 'parentId'));
          if (rel) await nudge(ctx, [rel], 2);
          addMood(ctx, 'family-pressure', 'Family pressure', -2, 2);
          return { title: 'Bought yourself some time', body: 'About three weeks, by your estimate.', tone: 'neutral', moneyDelta: 0 };
        },
      },
      {
        id: 'career',
        label: () => '“I’m focusing on my career”',
        resolve: async (ctx, p) => {
          const rel = await byId(ctx, str(p, 'parentId'));
          if (rel) await nudge(ctx, [rel], -3);
          return { title: '“Career will not hold your hand in old age”', body: 'The call ended with a long sigh and a Bible verse.', tone: 'neutral', moneyDelta: 0 };
        },
      },
      {
        id: 'introduce',
        label: () => '“Introduce me to someone”',
        hint: () => 'Mummy has a list',
        resolve: async (ctx, p) => {
          const rng = ctx.rng('matchmaking', ctx.time);
          const { person } = await people.introduceStranger(ctx, rng, 'church', 'arranged', 0, {
            romance: 20,
            closeness: 20,
            trait: 'family-oriented',
            gender: ctx.character.gender === 'male' ? 'female' : 'male',
            available: true,
          });
          const rel = await byId(ctx, str(p, 'parentId'));
          if (rel) await nudge(ctx, [rel], 5);
          return {
            title: `Meet ${person.firstName}`,
            body: `${str(p, 'parent')} sent you ${fullName(person)}’s number: “${person.occupation ?? 'Hardworking'}, from a good family, goes to church every Sunday.”`,
            tone: 'good',
            moneyDelta: 0,
          };
        },
      },
    ],
    defaultChoiceId: 'soon',
  };

  const owambeCard: LifeEventDefinition = {
    id: 'family-owambe-invite',
    domain: 'family',
    art: '🎉',
    weight: 5,
    cooldownDays: 30,
    eligible: (ctx) => ctx.age >= 18,
    prepare: (ctx) => {
      const rng = ctx.rng('owambe', dayIndexOf(ctx.time));
      const host = generateName(rng, ethnicityOfState(ctx.character.stateOfOrigin), rng.pick(['male', 'female'] as const));
      return {
        token: ctx.time,
        host: `${rng.pick(OWAMBE_HOSTS)} ${host.lastName}`,
        occasion: rng.pick(OWAMBE_OCCASIONS),
        asoEbi: ctx.world.price(rng.int(40, 70) * 1_000, ctx.time),
      };
    },
    title: (p) => `Owambe invitation: ${str(p, 'host')}’s ${str(p, 'occasion')}`,
    body: (p) => `Your family is going to ${str(p, 'host')}’s ${str(p, 'occasion')} on Saturday. Aso-ebi is ${naira(p, 'asoEbi')}. Small chops, live band, and every aunty you’ve been avoiding.`,
    choices: [
      {
        id: 'aso-ebi',
        label: (p) => `Go in full aso-ebi (${naira(p, 'asoEbi')})`,
        unavailable: afford('asoEbi'),
        resolve: async (ctx, p) => {
          const amount = await spend(ctx, p, 'family-owambe-invite', 'aso-ebi', 'asoEbi', 'purchase', `Aso-ebi for ${str(p, 'host')}’s party`);
          adjustStatus(ctx, 3);
          adjustConnections(ctx, 1);
          boostNeeds(ctx, { fun: 25, social: 30 });
          const rng = ctx.rng('owambe-meet', str(p, 'token'));
          if (rng.chance(0.4)) {
            const { person } = await people.introduceStranger(ctx, rng, 'event-centre', 'owambe');
            return { title: 'Owambe don burst!', body: `You danced, ate three plates of jollof and met ${fullName(person)}. Connections!`, tone: 'good', moneyDelta: -amount };
          }
          return { title: 'Owambe don burst!', body: 'You danced, ate three plates of jollof and took home a souvenir plastic bowl.', tone: 'good', moneyDelta: -amount };
        },
      },
      {
        id: 'plain',
        label: () => 'Go as you are',
        resolve: async (ctx) => {
          boostNeeds(ctx, { fun: 15, social: 20 });
          adjustStatus(ctx, -1);
          return { title: 'Seated at the back', body: 'No aso-ebi, no front row. The jollof was still sweet.', tone: 'neutral', moneyDelta: 0 };
        },
      },
      {
        id: 'skip',
        label: () => 'Send apologies',
        resolve: async () => ({ title: 'Quiet Saturday', body: 'You sent “Happy celebration, sir!” on WhatsApp and slept in.', tone: 'neutral', moneyDelta: 0 }),
      },
    ],
    defaultChoiceId: 'skip',
  };

  const ptaCard: LifeEventDefinition = {
    id: 'family-pta-levy',
    domain: 'family',
    art: '🏫',
    weight: 4,
    cooldownDays: 90,
    eligible: async (ctx) => (await household.state(ctx)).wards.some((ward) => attendsSchool(yearsBetween(ward.bornAt, ctx.time)) && ward.schoolTier !== 'none'),
    prepare: async (ctx) => {
      const rng = ctx.rng('pta', dayIndexOf(ctx.time));
      const ward = rng.pick((await household.state(ctx)).wards.filter((candidate) => attendsSchool(yearsBetween(candidate.bornAt, ctx.time)) && candidate.schoolTier !== 'none'));
      return { token: ctx.time, childId: ward.id, childName: ward.firstName, levy: ctx.world.price(rng.int(5, 25) * 1_000, ctx.time), reason: rng.pick(PTA_REASONS) };
    },
    title: (p) => `PTA levy at ${str(p, 'childName')}’s school`,
    body: (p) => `The PTA wants ${naira(p, 'levy')} per child for ${str(p, 'reason')}. ${str(p, 'childName')} brought the letter home in a sealed envelope, looking worried.`,
    choices: [
      {
        id: 'pay',
        label: (p) => `Pay ${naira(p, 'levy')}`,
        unavailable: afford('levy'),
        resolve: async (ctx, p) => {
          const amount = await spend(ctx, p, 'family-pta-levy', 'pay', 'levy', 'school-fees', `PTA levy — ${str(p, 'childName')}`);
          const rel = await byId(ctx, str(p, 'childId'));
          if (rel) await nudge(ctx, [rel], 2);
          return { title: 'Levy paid', body: 'Receipt number 004417. Keep it — they will ask again.', tone: 'neutral', moneyDelta: -amount };
        },
      },
      {
        id: 'later',
        label: () => '“Tell them next week”',
        resolve: async (ctx, p) => {
          const rel = await byId(ctx, str(p, 'childId'));
          if (rel) await nudge(ctx, [rel], -2);
          addMood(ctx, 'pta-shame', 'Owing the PTA', -2, 2);
          return { title: 'Name on the board', body: `${str(p, 'childName')}’s name is on the “owing” list on the school notice board.`, tone: 'bad', moneyDelta: 0 };
        },
      },
    ],
    defaultChoiceId: 'later',
  };

  const japaCard: LifeEventDefinition = {
    id: 'family-partner-japa',
    domain: 'family',
    art: '✈️',
    weight: 3,
    cooldownDays: 360,
    eligible: async (ctx) => {
      const partner = await partnerNpc(ctx);
      if (!partner || (partner.flags.abroadUntil ?? 0) > ctx.time) return false;
      return yearsBetween(identityOf(await graph(ctx), partner).bornAt, ctx.time) < 45;
    },
    prepare: async (ctx) => {
      const partner = await partnerNpc(ctx);
      const name = partner ? identityOf(await graph(ctx), partner).firstName : 'Your partner';
      const rng = ctx.rng('japa', dayIndexOf(ctx.time));
      return { token: ctx.time, partnerId: partner?.id ?? '', name, country: rng.pick(['Canada', 'the UK', 'Germany', 'Ireland']), cost: ctx.world.price(1_500_000, ctx.time) };
    },
    title: (p) => `${str(p, 'name')} wants to japa`,
    body: (p) => `${str(p, 'name')} got an offer in ${str(p, 'country')} and wants to go. “Let’s think about our future.” Proof of funds needs ${naira(p, 'cost')} from you.`,
    choices: [
      {
        id: 'support',
        label: (p) => `Support the move (${naira(p, 'cost')})`,
        hint: () => 'Long distance for a year',
        unavailable: afford('cost'),
        resolve: async (ctx, p) => {
          const amount = await spend(ctx, p, 'family-partner-japa', 'support', 'cost', 'family-support', `Japa support for ${str(p, 'name')}`);
          const rel = await byId(ctx, str(p, 'partnerId'));
          if (rel) {
            await nudge(ctx, [rel], 5, 10);
            relationships.setFlags(rel, { abroadUntil: ctx.time + 360 * MINUTES_PER_DAY });
            await relationships.save(ctx, rel);
          }
          return { title: 'Long distance it is', body: `${str(p, 'name')} landed in ${str(p, 'country')}. Video calls at 2am, voice notes all day. Romance fades faster while apart.`, tone: 'neutral', moneyDelta: -amount };
        },
      },
      {
        id: 'stay',
        label: () => '“Let’s build Nigeria together”',
        hint: () => 'Depends on your love',
        resolve: async (ctx, p): Promise<LifeEventOutcome> => {
          const rel = await byId(ctx, str(p, 'partnerId'));
          if (!rel) return { title: 'Nothing changed', body: '', tone: 'neutral', moneyDelta: 0 };
          const romance = relationships.romance(rel, ctx.time);
          if (ctx.rng('japa-stay', rel.id, str(p, 'token')).chance(romance / 100)) {
            await nudge(ctx, [rel], 0, -5);
            return { title: `${str(p, 'name')} is staying`, body: '“Only for you.” They will remind you of this sacrifice. Often.', tone: 'good', moneyDelta: 0 };
          }
          const married = rel.kind === 'spouse';
          if (married) {
            relationships.setFlags(rel, { abroadUntil: ctx.time + 360 * MINUTES_PER_DAY });
          } else {
            relationships.changeKind(rel, 'ex', ctx.time);
            relationships.setFlags(rel, { endedBy: 'them' });
            const person = identityOf(await graph(ctx), rel).person;
            if (person) {
              person.available = true;
              await relationships.savePeople(ctx, person);
            }
          }
          await relationships.save(ctx, rel);
          relationships.householdChanged(ctx);
          addMood(ctx, 'heartbreak', 'Left behind', -12, 10);
          return {
            title: `${str(p, 'name')} left anyway`,
            body: married ? 'They took the flight. The marriage survives on WhatsApp calls.' : 'They took the flight — and their heart with them. It’s over.',
            tone: 'bad',
            moneyDelta: 0,
          };
        },
      },
    ],
    defaultChoiceId: 'stay',
  };

  const birthdayCard: LifeEventDefinition = {
    id: 'family-partner-birthday',
    domain: 'family',
    art: '🎂',
    weight: 8,
    cooldownDays: 300,
    eligible: async (ctx) => {
      const partner = await partnerNpc(ctx);
      if (!partner) return false;
      const bornAt = identityOf(await graph(ctx), partner).bornAt;
      const gap = (dayOfYear(ctx.time) - dayOfYear(bornAt) + 360) % 360;
      return gap <= 3;
    },
    prepare: async (ctx) => {
      const partner = await partnerNpc(ctx);
      return {
        token: ctx.time,
        partnerId: partner?.id ?? '',
        name: partner ? identityOf(await graph(ctx), partner).firstName : 'Your partner',
        lavish: ctx.world.price(250_000, ctx.time),
        dinner: ctx.world.price(60_000, ctx.time),
      };
    },
    title: (p) => `It’s ${str(p, 'name')}’s birthday!`,
    body: (p) => `${str(p, 'name')} has changed their WhatsApp status three times today. They are expecting something special.`,
    choices: [
      {
        id: 'lavish',
        label: (p) => `Surprise party and a designer bag (${naira(p, 'lavish')})`,
        unavailable: afford('lavish'),
        resolve: async (ctx, p) => {
          const amount = await spend(ctx, p, 'family-partner-birthday', 'lavish', 'lavish', 'purchase', `Birthday surprise for ${str(p, 'name')}`);
          const rel = await byId(ctx, str(p, 'partnerId'));
          if (rel) await nudge(ctx, [rel], 5, 12);
          return { title: 'Partner of the year', body: 'They cried, posted it everywhere and tagged you 14 times.', tone: 'good', moneyDelta: -amount };
        },
      },
      {
        id: 'dinner',
        label: (p) => `Thoughtful dinner (${naira(p, 'dinner')})`,
        unavailable: afford('dinner'),
        resolve: async (ctx, p) => {
          const amount = await spend(ctx, p, 'family-partner-birthday', 'dinner', 'dinner', 'purchase', `Birthday dinner for ${str(p, 'name')}`);
          const rel = await byId(ctx, str(p, 'partnerId'));
          if (rel) await nudge(ctx, [rel], 3, 7);
          return { title: 'Sweet and simple', body: 'Candles, their favourite pepper soup and a handwritten card. It landed.', tone: 'good', moneyDelta: -amount };
        },
      },
      {
        id: 'text',
        label: () => '“Happy birthday dear 🎂”',
        resolve: async (ctx, p) => {
          const rel = await byId(ctx, str(p, 'partnerId'));
          if (rel) await nudge(ctx, [rel], -3, -8);
          return { title: 'Just a text?', body: '“Wow. Okay.” The temperature in the house has dropped.', tone: 'bad', moneyDelta: 0 };
        },
      },
    ],
    defaultChoiceId: 'text',
  };

  const landCard: LifeEventDefinition = {
    id: 'family-land-meeting',
    domain: 'family',
    art: '🌴',
    weight: 3,
    cooldownDays: 360,
    eligible: async (ctx) => ctx.age >= 25 && relationshipsOfKind(await graph(ctx), 'father', 'mother', 'grandparent').length > 0,
    prepare: (ctx) => {
      const rng = ctx.rng('land', dayIndexOf(ctx.time));
      const [min, max] = LAND_SHARE[ctx.character.background];
      return {
        token: ctx.time,
        uncle: generateName(rng, ethnicityOfState(ctx.character.stateOfOrigin), 'male').firstName,
        share: Math.round(rng.int(min, max) / 1_000) * 1_000,
        survey: ctx.world.price(300_000, ctx.time),
      };
    },
    title: () => 'Family meeting about the land in the village',
    body: (p) => `Uncle ${str(p, 'uncle')} has been “managing” Grandpa’s land since 1998. Now a developer is offering money. Everybody is on the family Zoom call (cameras off).`,
    choices: [
      {
        id: 'sell',
        label: (p) => `Push to sell and share (your share ~${naira(p, 'share')})`,
        hint: () => 'The elders won’t like it',
        resolve: async (ctx, p) => {
          const share = num(p, 'share');
          await ctx.wallet.receive(share, 'inheritance', 'Share of the family land sale', payKey('family-land-meeting', p, 'sell'), { income: 'unearned' });
          const g = await graph(ctx);
          await nudge(ctx, relationshipsOfKind(g, 'father', 'mother').filter((rel) => alive(g, rel)), -4);
          return { title: 'Land sold', body: `Your share landed: ${naira(p, 'share')} — after Uncle ${str(p, 'uncle')}’s “processing fee”.`, tone: 'good', moneyDelta: share };
        },
      },
      {
        id: 'keep',
        label: () => '“Keep it for the next generation”',
        resolve: async (ctx) => {
          const g = await graph(ctx);
          await nudge(ctx, relationshipsOfKind(g, 'father', 'mother').filter((rel) => alive(g, rel)), 5);
          adjustStatus(ctx, 2);
          return { title: 'The elders nodded', body: 'Your father said “this one has sense” on the call. High praise.', tone: 'good', moneyDelta: 0 };
        },
      },
      {
        id: 'survey',
        label: (p) => `Fund a survey and C of O (${naira(p, 'survey')})`,
        hint: () => 'Protect it from omonile',
        unavailable: afford('survey'),
        resolve: async (ctx, p) => {
          const amount = await spend(ctx, p, 'family-land-meeting', 'survey', 'survey', 'family-support', 'Survey and C of O for the family land');
          await nudge(ctx, await elders(ctx), 6);
          adjustStatus(ctx, 4);
          return { title: 'Land committee chairman', body: 'Your name is now on the family land committee. The omonile have been warned.', tone: 'good', moneyDelta: -amount };
        },
      },
    ],
    defaultChoiceId: 'keep',
  };

  return [blackTaxCard, funeralCard, namingCard, sentHomeCard, asoEbiCard, inLawCard, someoneHomeCard, owambeCard, ptaCard, japaCard, birthdayCard, landCard];
}

