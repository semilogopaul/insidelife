import { applySkillXp, formatNaira, type SkillKey, type Skills } from '@insidelife/shared';
import type { LifeEventDefinition, LifeEventParams } from '../events/interfaces/life-event.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { addMoodModifier } from './education.helpers.js';
import type { EnrolmentService, ResolvedEnrolment } from './services/enrolment.service.js';
import type { WaecJambService } from './services/waec-jamb.service.js';

/** Services the education cards act through. */
export interface EducationEventDeps {
  readonly enrolments: EnrolmentService;
  readonly exams: WaecJambService;
}

const DOMAIN = 'education';
const LECTURERS = ['Dr. Adebayo', 'Prof. Okonkwo', 'Dr. (Mrs) Bello', 'Dr. Eze', 'Prof. Danjuma', 'Dr. Olatunji'] as const;
const COURSE_CODES = ['GST 102', 'MTH 201', 'ECO 211', 'CSC 301', 'LAW 214', 'ACC 305', 'PHY 103'] as const;
const SCHOLARSHIP_AMOUNT = 200_000;

const num = (params: LifeEventParams, key: string): number => Number(params[key] ?? 0);
const str = (params: LifeEventParams, key: string): string => String(params[key] ?? '');
const cantAfford = (ctx: SimulationContext, amount: number): string | null =>
  ctx.wallet.canAfford(amount) ? null : `You need ${formatNaira(amount)} for this`;

function growSkill(ctx: SimulationContext, skill: SkillKey, xp: number): void {
  const skills: Record<SkillKey, number> = { ...ctx.character.skills };
  skills[skill] = applySkillXp(skills[skill], xp);
  ctx.character.skills = skills as Skills;
}

/**
 * Campus life cards: the "compulsory" handout, sorting, strike hustles, JAMB portal wahala, scholarships, SUG
 * politics, group projects and fake "expo". Outcomes are seeded per card (`ctx.rng`) and keyed by the card's `ref`,
 * so a resolved card can never be re-rolled or double-paid.
 */
export function educationEvents(deps: EducationEventDeps): readonly LifeEventDefinition[] {
  /** Enrolled, lectures running (not on strike, not suspended). */
  const inClass = async (ctx: SimulationContext): Promise<ResolvedEnrolment | null> => {
    const current = await deps.enrolments.current(ctx);
    return current && deps.enrolments.inSession(ctx, current, ctx.time) ? current : null;
  };
  const adjustMastery = async (ctx: SimulationContext, delta: number): Promise<void> => {
    const current = await deps.enrolments.current(ctx);
    if (current) await deps.enrolments.adjustMastery(ctx, current, delta);
  };

  const handout: LifeEventDefinition = {
    id: 'education-compulsory-handout',
    domain: DOMAIN,
    art: '📄',
    weight: 6,
    cooldownDays: 45,
    eligible: async (ctx) => (await inClass(ctx)) !== null,
    prepare: (ctx) => {
      const rng = ctx.rng('event', 'handout', ctx.time);
      return { lecturer: rng.pick(LECTURERS), course: rng.pick(COURSE_CODES), price: ctx.world.price(5_000, ctx.time), ref: ctx.time };
    },
    title: () => 'The “not compulsory” handout',
    body: (p) =>
      `${str(p, 'lecturer')} says the ${str(p, 'course')} handout (${formatNaira(num(p, 'price'))}) is “not compulsory”… but questions “may” come from it. The class rep is writing names.`,
    choices: [
      {
        id: 'buy',
        label: (p) => `Buy it (${formatNaira(num(p, 'price'))})`,
        unavailable: (ctx, p) => cantAfford(ctx, num(p, 'price')),
        resolve: async (ctx, p) => {
          await ctx.wallet.pay(num(p, 'price'), 'school-fees', `${str(p, 'course')} handout`, `event:handout:${num(p, 'ref')}`);
          await adjustMastery(ctx, 4);
          return { title: 'Page 12 was the exam', body: 'Half the questions came straight from the handout. Money well spent.', tone: 'good', moneyDelta: -num(p, 'price') };
        },
      },
      {
        id: 'photocopy',
        label: () => `Photocopy a friend’s copy (${formatNaira(500)})`,
        hint: () => 'risky',
        unavailable: (ctx) => cantAfford(ctx, 500),
        resolve: async (ctx, p) => {
          await ctx.wallet.pay(500, 'purchase', 'Handout photocopy', `event:handout-copy:${num(p, 'ref')}`);
          if (ctx.rng('event', 'handout-copy', num(p, 'ref')).chance(0.65)) {
            await adjustMastery(ctx, 3);
            return { title: 'Same knowledge, cheaper', body: 'Nobody checked. You read it cover to cover.', tone: 'good', moneyDelta: -500 };
          }
          await adjustMastery(ctx, -2);
          addMoodModifier(ctx, 'handout-caught', 'Marked by a lecturer', -6, 3);
          return { title: 'E don cast', body: `${str(p, 'lecturer')} compared the buyers’ list with the class list. Your name dey “wanted”.`, tone: 'bad', moneyDelta: -500 };
        },
      },
      {
        id: 'skip',
        label: () => 'Skip it — your notes will do',
        resolve: async (ctx) => {
          await adjustMastery(ctx, -1);
          return { title: 'Notes only', body: 'You’ll manage. Probably.', tone: 'neutral' };
        },
      },
    ],
    defaultChoiceId: 'skip',
  };

  const sorting: LifeEventDefinition = {
    id: 'education-sorting-offer',
    domain: DOMAIN,
    art: '🤫',
    weight: 3,
    cooldownDays: 120,
    eligible: async (ctx) => (await inClass(ctx)) !== null,
    prepare: (ctx) => {
      const rng = ctx.rng('event', 'sorting', ctx.time);
      return { course: rng.pick(COURSE_CODES), price: ctx.world.price(rng.int(5, 15) * 10_000, ctx.time), ref: ctx.time };
    },
    title: () => 'A “sorting” offer',
    body: (p) =>
      `A guy from the department whispers: for ${formatNaira(num(p, 'price'))}, your ${str(p, 'course')} grade “go correct”. No receipts, obviously.`,
    choices: [
      {
        id: 'pay',
        label: (p) => `Pay ${formatNaira(num(p, 'price'))}`,
        hint: () => 'very risky',
        unavailable: (ctx, p) => cantAfford(ctx, num(p, 'price')),
        resolve: async (ctx, p) => {
          const price = num(p, 'price');
          await ctx.wallet.pay(price, 'fee', 'Cash to a "sorting" middleman', `event:sorting:${num(p, 'ref')}`);
          if (ctx.rng('event', 'sorting-outcome', num(p, 'ref')).chance(0.3)) {
            await adjustMastery(ctx, -25);
            addMoodModifier(ctx, 'sorting-caught', 'Caught in a sorting sting', -20, 7);
            return {
              title: 'Caught in the sting',
              body: 'The anti-corruption unit was waiting. Your script was seized and you’ll resit. Money gone, peace of mind gone.',
              tone: 'bad',
              moneyDelta: -price,
            };
          }
          await adjustMastery(ctx, 15);
          addMoodModifier(ctx, 'sorting-guilt', 'Guilty conscience', -3, 5);
          return { title: 'It worked… this time', body: 'Your grade “improved”. Your conscience is looking at you.', tone: 'neutral', moneyDelta: -price };
        },
      },
      {
        id: 'refuse',
        label: () => 'Refuse — read your book',
        resolve: async (ctx) => {
          addMoodModifier(ctx, 'integrity', 'Stood on integrity', 3, 3);
          return { title: 'Integrity no dey cost money', body: 'You walked away. The library is free.', tone: 'good' };
        },
      },
      {
        id: 'report',
        label: () => 'Report to the anti-corruption unit',
        hint: () => 'brave',
        resolve: async (ctx, p) => {
          if (ctx.rng('event', 'sorting-report', num(p, 'ref')).chance(0.5)) {
            ctx.character.connections = Math.min(100, ctx.character.connections + 2);
            addMoodModifier(ctx, 'whistleblower', 'Exposed a sorting ring', 8, 5);
            return { title: 'Ring busted', body: 'The middleman and two lecturers were suspended. Your coursemates are calling you “Comrade”.', tone: 'good' };
          }
          await adjustMastery(ctx, -6);
          return { title: 'Victimised', body: 'Somebody leaked your name. That lecturer is now marking your scripts “carefully”.', tone: 'bad' };
        },
      },
    ],
    defaultChoiceId: 'refuse',
  };

  const strikeHustle: LifeEventDefinition = {
    id: 'education-strike-hustle',
    domain: DOMAIN,
    art: '🪧',
    weight: 8,
    cooldownDays: 30,
    eligible: async (ctx) => {
      const current = await deps.enrolments.current(ctx);
      return current !== null && current.enrolment.status === 'active' && deps.enrolments.isOnStrike(ctx, current.institution, ctx.time);
    },
    prepare: async (ctx) => {
      const current = await deps.enrolments.current(ctx);
      return { pay: ctx.world.price(ctx.rng('event', 'strike-pay', ctx.time).int(30, 60) * 1_000, ctx.time), school: current?.institution.shortName ?? 'school', ref: ctx.time };
    },
    title: () => 'Strike don start — now what?',
    body: (p) =>
      `${str(p, 'school')} is shut and nobody knows when lecturers will resume. Your cousin needs help at his POS stand for two weeks — ${formatNaira(num(p, 'pay'))}.`,
    choices: [
      {
        id: 'hustle',
        label: (p) => `Run the POS stand (+${formatNaira(num(p, 'pay'))})`,
        resolve: async (ctx, p) => {
          await ctx.wallet.receive(num(p, 'pay'), 'hustle', 'Strike-season POS hustle', `event:strike-hustle:${num(p, 'ref')}`, { income: 'earned' });
          growSkill(ctx, 'hustle', 3);
          return { title: 'Strike money', body: 'Two weeks of “network no go” and cash-out queues. You learnt more about Lagos than any lecture.', tone: 'good', moneyDelta: num(p, 'pay') };
        },
      },
      {
        id: 'learn',
        label: () => 'Learn a skill on YouTube',
        resolve: async (ctx) => {
          growSkill(ctx, 'tech', 3);
          addMoodModifier(ctx, 'strike-productive', 'Productive strike', 4, 5);
          return { title: 'Strike-to-skill pipeline', body: 'You learnt Figma and basic Python. ASUU, thank you?', tone: 'good' };
        },
      },
      {
        id: 'rest',
        label: () => 'Sleep, eat, repeat',
        resolve: async (ctx) => {
          addMoodModifier(ctx, 'strike-boredom', 'Strike boredom', -4, 5);
          return { title: 'Strike boredom is real', body: 'You finished three Nollywood series and one bag of garri.', tone: 'neutral' };
        },
      },
    ],
    defaultChoiceId: 'rest',
  };

  const jambGlitch: LifeEventDefinition = {
    id: 'education-jamb-glitch',
    domain: DOMAIN,
    art: '🖥️',
    weight: 7,
    cooldownDays: 20,
    eligible: async (ctx) => (await deps.exams.pendingJamb(ctx))?.status === 'registered',
    prepare: (ctx) => ({ bribe: ctx.world.price(10_000, ctx.time), ref: ctx.time }),
    title: () => 'JAMB portal glitch',
    body: (p) =>
      `The CBT centre says your registration “no show for system”. Come back in two days — or “settle” a runner with ${formatNaira(num(p, 'bribe'))} to fix it sharp sharp.`,
    choices: [
      {
        id: 'wait',
        label: () => 'Wait it out (+2 days)',
        resolve: async (ctx) => {
          const pending = await deps.exams.pendingJamb(ctx);
          if (pending) await deps.exams.reschedule(ctx, pending, 2);
          return { title: 'Rescheduled', body: 'Two more days to read. Use am well.', tone: 'neutral' };
        },
      },
      {
        id: 'runner',
        label: (p) => `Pay the runner (${formatNaira(num(p, 'bribe'))})`,
        hint: () => 'risky',
        unavailable: (ctx, p) => cantAfford(ctx, num(p, 'bribe')),
        resolve: async (ctx, p) => {
          const bribe = num(p, 'bribe');
          await ctx.wallet.pay(bribe, 'fee', 'CBT centre "runner"', `event:jamb-runner:${num(p, 'ref')}`);
          if (ctx.rng('event', 'jamb-runner', num(p, 'ref')).chance(0.3)) {
            return { title: 'E work!', body: 'Your record “reappeared”. Your exam slot stands.', tone: 'neutral', moneyDelta: -bribe };
          }
          const pending = await deps.exams.pendingJamb(ctx);
          if (pending) await deps.exams.reschedule(ctx, pending, 2);
          return { title: 'Runner don japa', body: 'He collected the money and switched off his phone. You still have to wait two days.', tone: 'bad', moneyDelta: -bribe };
        },
      },
    ],
    defaultChoiceId: 'wait',
  };

  const scholarship: LifeEventDefinition = {
    id: 'education-scholarship',
    domain: DOMAIN,
    art: '🏅',
    weight: 5,
    cooldownDays: 300,
    eligible: async (ctx) => {
      const current = await deps.enrolments.current(ctx);
      return current !== null && current.enrolment.status === 'active' && (current.enrolment.cgpa ?? 0) >= 4;
    },
    prepare: async (ctx) => ({ cgpa: (await deps.enrolments.current(ctx))?.enrolment.cgpa ?? 0, ref: ctx.time }),
    title: () => 'Scholarship opening',
    body: () =>
      `A telco foundation is offering ${formatNaira(SCHOLARSHIP_AMOUNT)} scholarships to undergraduates with a CGPA of 4.0+. The essay is due tomorrow.`,
    choices: [
      {
        id: 'apply',
        label: () => 'Write the essay and apply',
        resolve: async (ctx, p) => {
          const chance = Math.min(0.9, Math.max(0.3, 0.35 + (num(p, 'cgpa') - 4) * 0.6 + ctx.character.skills.charisma / 200));
          if (ctx.rng('event', 'scholarship', num(p, 'ref')).chance(chance)) {
            await ctx.wallet.receive(SCHOLARSHIP_AMOUNT, 'event-reward', 'Foundation scholarship award', `event:scholarship:${num(p, 'ref')}`, { income: 'earned' });
            addMoodModifier(ctx, 'scholar', 'Scholarship winner', 10, 7);
            return { title: 'Scholarship won! 🏅', body: 'Your CGPA just paid you. The award letter is going on the fridge.', tone: 'good', moneyDelta: SCHOLARSHIP_AMOUNT };
          }
          return { title: 'Shortlisted, not selected', body: 'So close. Keep that CGPA up — there’s always next year.', tone: 'neutral' };
        },
      },
      {
        id: 'skip',
        label: () => 'No time for essays',
        resolve: async () => ({ title: 'Maybe next year', body: 'Someone with a 4.01 is very grateful you skipped.', tone: 'neutral' }),
      },
    ],
    defaultChoiceId: 'skip',
  };

  const sugElection: LifeEventDefinition = {
    id: 'education-sug-election',
    domain: DOMAIN,
    art: '🗳️',
    weight: 3,
    cooldownDays: 180,
    eligible: async (ctx) => {
      const current = await inClass(ctx);
      return current !== null && current.enrolment.level >= 2;
    },
    prepare: (ctx) => ({ cost: ctx.world.price(ctx.rng('event', 'sug-cost', ctx.time).int(5, 15) * 10_000, ctx.time), ref: ctx.time }),
    title: () => 'SUG elections are here',
    body: (p) =>
      `Your hostel boys say you should run for Students’ Union. Posters, jingles and “mobilisation” will cost about ${formatNaira(num(p, 'cost'))}.`,
    choices: [
      {
        id: 'run',
        label: (p) => `Run for office (${formatNaira(num(p, 'cost'))})`,
        hint: () => 'charisma + connections',
        unavailable: (ctx, p) => cantAfford(ctx, num(p, 'cost')),
        resolve: async (ctx, p) => {
          const cost = num(p, 'cost');
          await ctx.wallet.pay(cost, 'purchase', 'SUG campaign', `event:sug:${num(p, 'ref')}`);
          const chance = Math.min(0.75, Math.max(0.1, 0.2 + ctx.character.skills.charisma / 150 + ctx.character.connections / 200));
          if (ctx.rng('event', 'sug-vote', num(p, 'ref')).chance(chance)) {
            ctx.character.status = Math.min(1000, ctx.character.status + 25);
            ctx.character.connections = Math.min(100, ctx.character.connections + 5);
            addMoodModifier(ctx, 'sug-win', 'Comrade President', 12, 10);
            return { title: 'Comrade President! ✊🏾', body: 'You won. Everybody on campus knows your name now — and your phone never stops ringing.', tone: 'good', moneyDelta: -cost };
          }
          ctx.character.connections = Math.min(100, ctx.character.connections + 2);
          addMoodModifier(ctx, 'sug-loss', 'Lost the SUG election', -8, 5);
          return { title: 'You lost (narrowly)', body: 'The other candidate shared more indomie. But the campaign made you known.', tone: 'bad', moneyDelta: -cost };
        },
      },
      {
        id: 'endorse',
        label: () => 'Back a friend instead',
        resolve: async (ctx) => {
          ctx.character.connections = Math.min(100, ctx.character.connections + 2);
          return { title: 'Kingmaker', body: 'You campaigned for your guy. Whoever wins, you know people now.', tone: 'good' };
        },
      },
      {
        id: 'ignore',
        label: () => 'Politics? Not me',
        resolve: async () => ({ title: 'Staying neutral', body: 'You watched the drama from your hostel window.', tone: 'neutral' }),
      },
    ],
    defaultChoiceId: 'ignore',
  };

  const groupProject: LifeEventDefinition = {
    id: 'education-group-project',
    domain: DOMAIN,
    art: '🧑🏾‍🤝‍🧑🏾',
    weight: 6,
    cooldownDays: 60,
    eligible: async (ctx) => (await inClass(ctx)) !== null,
    prepare: (ctx) => ({ ref: ctx.time }),
    title: () => 'Group project wahala',
    body: () => 'Five people in your group. Four have “network issues”. The submission is on Friday.',
    choices: [
      {
        id: 'carry',
        label: () => 'Carry the whole thing',
        hint: () => 'tiring',
        resolve: async (ctx) => {
          await adjustMastery(ctx, 6);
          ctx.character.needs = { ...ctx.character.needs, energy: Math.max(0, ctx.character.needs.energy - 20) };
          addMoodModifier(ctx, 'carried-group', 'Carried the group', -5, 3);
          return { title: 'You carried the team', body: 'The lecturer noticed whose writing style it was. Your mastery shows.', tone: 'good' };
        },
      },
      {
        id: 'report',
        label: () => 'Report them to the lecturer',
        resolve: async (ctx, p) => {
          if (ctx.rng('event', 'group-report', num(p, 'ref')).chance(0.55)) {
            await adjustMastery(ctx, 3);
            return { title: 'Graded individually', body: 'The lecturer split the marks. Justice!', tone: 'good' };
          }
          addMoodModifier(ctx, 'group-ignored', 'Lecturer didn’t care', -3, 3);
          return { title: '“Sort yourselves out”', body: 'The lecturer was not interested. Now the group chat is cold.', tone: 'neutral' };
        },
      },
      {
        id: 'share',
        label: () => 'Do only your part',
        resolve: async (ctx) => {
          await adjustMastery(ctx, -2);
          return { title: 'Your part was perfect', body: 'The rest was a disaster. Group grade: C.', tone: 'neutral' };
        },
      },
    ],
    defaultChoiceId: 'share',
  };

  const fakeExpo: LifeEventDefinition = {
    id: 'education-gce-expo',
    domain: DOMAIN,
    art: '📲',
    weight: 5,
    cooldownDays: 30,
    eligible: async (ctx) => (await deps.exams.pendingGce(ctx)) !== null,
    prepare: (ctx) => ({ price: ctx.world.price(15_000, ctx.time), ref: ctx.time }),
    title: () => '“Original GCE expo” on WhatsApp',
    body: (p) => `A WhatsApp channel promises “100% original” GCE answers for ${formatNaira(num(p, 'price'))}. Payment first, of course.`,
    choices: [
      {
        id: 'buy',
        label: (p) => `Buy the “expo” (${formatNaira(num(p, 'price'))})`,
        hint: () => 'too good to be true?',
        unavailable: (ctx, p) => cantAfford(ctx, num(p, 'price')),
        resolve: async (ctx, p) => {
          await ctx.wallet.pay(num(p, 'price'), 'purchase', 'WhatsApp "expo"', `event:expo:${num(p, 'ref')}`);
          addMoodModifier(ctx, 'expo-scam', 'Scammed by fake expo', -6, 3);
          return { title: 'Expo na scam', body: 'The “answers” were last year’s questions with the options shuffled. The channel has blocked you.', tone: 'bad', moneyDelta: -num(p, 'price') };
        },
      },
      {
        id: 'read',
        label: () => 'Ignore it and do past questions',
        resolve: async (ctx) => {
          const pending = await deps.exams.pendingGce(ctx);
          if (pending) await deps.exams.addPrep(ctx, pending, 2);
          return { title: 'Past questions > expo', body: 'Two extra hours of past questions. The real expo was the friends we made along the way.', tone: 'good' };
        },
      },
    ],
    defaultChoiceId: 'read',
  };

  return [handout, sorting, strikeHustle, jambGlitch, scholarship, sugElection, groupProject, fakeExpo];
}
