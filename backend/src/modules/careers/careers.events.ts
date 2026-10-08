import {
  MINUTES_PER_DAY,
  MINUTES_PER_YEAR,
  findJob,
  formatNaira,
  type JobDefinition,
  type JobTrait,
  type Needs,
} from '@insidelife/shared';
import type { LifeEventDefinition, LifeEventOutcome, LifeEventParams } from '../events/interfaces/life-event.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { ApplicationsService } from './applications.service.js';
import { employerOf, titleOf } from './career.presenter.js';
import type { CareerStore } from './career.store.js';
import type { EmploymentEntity } from './entities/employment.entity.js';
import type { EmploymentService } from './employment.service.js';
import type { PromotionsService } from './promotions.service.js';
import { levelPay } from './rules/payroll.js';

export interface CareerEventDeps {
  readonly store: CareerStore;
  readonly employment: EmploymentService;
  readonly promotions: PromotionsService;
  readonly applications: ApplicationsService;
}

interface Employed {
  readonly employment: EmploymentEntity;
  readonly job: JobDefinition;
}

const COLLEAGUES = ['Tunde', 'Chiamaka', 'Bisi', 'Emeka', 'Halima', 'Segun', 'Ngozi', 'Kunle', 'Aisha', 'Femi'] as const;
const RIVALS = ['Zenon Capital', 'Crestline Partners', 'Atlas & Bloom', 'Northgate Group', 'Harbour Point Holdings'] as const;
const SONGS = ['Shayo Anthem', 'Lekki Love', 'Sapa No Dey Catch Me', 'Owambe Queen', 'Third Mainland Vibes', 'Japa Riddim'] as const;
const DESTINATIONS = ['the UK (NHS)', 'Canada', 'Saudi Arabia', 'Ireland'] as const;

const GOODWILL_LIMIT = 0.3;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const text = (params: LifeEventParams, key: string): string => String(params[key] ?? '');
const amount = (params: LifeEventParams, key: string): number => Number(params[key] ?? 0);
const roundTo = (value: number, step: number): number => Math.max(step, Math.round(value / step) * step);

function adjustNeeds(ctx: SimulationContext, changes: Partial<Needs>): void {
  const needs = { ...ctx.character.needs };
  for (const [key, delta] of Object.entries(changes) as Array<[keyof Needs, number]>) needs[key] = clamp(needs[key] + delta, 0, 100);
  ctx.character.needs = needs;
}

function moodModifier(ctx: SimulationContext, id: string, label: string, value: number, days: number): void {
  ctx.character.moodModifiers = [
    ...ctx.character.moodModifiers.filter((modifier) => modifier.id !== id),
    { id, label, value, until: ctx.time + days * MINUTES_PER_DAY },
  ];
}

function addConnections(ctx: SimulationContext, delta: number): void {
  ctx.character.connections = clamp(ctx.character.connections + delta, 0, 100);
}

/** Monthly pay in naira at today's rate. */
function payNaira(ctx: SimulationContext, { employment, job }: Employed): number {
  const pay = levelPay(job, employment.level, employment.payAdjustment);
  return job.currency === 'USD' ? pay * ctx.world.economy(ctx.time).usdRate : pay;
}

const cantAfford = (ctx: SimulationContext, cost: number): string | null =>
  ctx.wallet.canAfford(cost) ? null : `You need ${formatNaira(cost)} for this`;

/**
 * Career life-event cards. Built with the domain's services (the engine hands every hook the locked character's
 * context, so cards read and write careers state in the same transaction).
 */
export function careerEvents(deps: CareerEventDeps): LifeEventDefinition[] {
  const { store, employment: employmentService, promotions, applications } = deps;

  /** The current job if it has started (and carries `trait`, when given). */
  async function employed(ctx: SimulationContext, trait?: JobTrait): Promise<Employed | null> {
    const employment = await store.active(ctx);
    const job = employment ? findJob(employment.jobId) : undefined;
    if (!employment || !job || employment.startedAt > ctx.time) return null;
    if (trait && !job.traits.includes(trait)) return null;
    return { employment, job };
  }

  async function withJob(ctx: SimulationContext, fallback: string, work: (current: Employed) => Promise<LifeEventOutcome>): Promise<LifeEventOutcome> {
    const current = await employed(ctx);
    if (!current) return { title: 'Moot point', body: fallback, tone: 'neutral' };
    return work(current);
  }

  async function nudgeGoodwill(ctx: SimulationContext, { employment }: Employed, delta: number, performance = 0): Promise<void> {
    employment.goodwill = clamp(employment.goodwill + delta, -GOODWILL_LIMIT, GOODWILL_LIMIT);
    employment.performance = clamp(employment.performance + performance, 0, 1);
    await store.save(ctx, employment);
  }

  const interview: LifeEventDefinition = {
    id: 'job-interview',
    domain: 'careers',
    art: '🤝',
    weight: 40,
    cooldownDays: 0,
    expiresIn: MINUTES_PER_DAY,
    eligible: async (ctx) => (await applications.interviewCandidates(ctx)).length > 0,
    prepare: async (ctx) => {
      const application = await applications.dealInterviewCard(ctx);
      const job = application ? findJob(application.jobId) : undefined;
      return {
        applicationId: application?.id ?? '',
        employer: job?.employer ?? 'the company',
        title: job ? titleOf(job, 0) : 'the role',
      };
    },
    title: (p) => `Interview at ${text(p, 'employer')}`,
    body: (p) =>
      `HR called: you’ve been shortlisted for ${text(p, 'title')}. The panel sits tomorrow morning — three stern faces and one smiling one. How do you play it?`,
    choices: [
      {
        id: 'prepare',
        label: () => 'Research the company and iron your best shirt',
        hint: () => 'Solid boost',
        resolve: async (ctx, p) => {
          await applications.recordInterview(ctx, text(p, 'applicationId'), 0.12, 'Interview went well — you were prepared.');
          return { title: 'You came prepared', body: 'You quoted their annual report back to them. The smiling panelist nodded twice.', tone: 'good' };
        },
      },
      {
        id: 'connect',
        label: () => 'Ask your uncle to “put in a word” (₦20,000 thank-you)',
        hint: () => 'Better if you know people',
        unavailable: (ctx) => cantAfford(ctx, 20_000),
        resolve: async (ctx, p) => {
          await ctx.wallet.pay(20_000, 'gift', 'Thank-you to Uncle for the connection', `event:job-interview:connect:${text(p, 'applicationId')}`);
          const bonus = clamp(0.05 + ctx.character.connections / 250, 0.05, 0.25);
          await applications.recordInterview(ctx, text(p, 'applicationId'), bonus, 'Somebody put in a word for you.');
          return { title: 'Man know man', body: 'Uncle made one call. The interview felt more like a chat.', tone: 'good', moneyDelta: -20_000 };
        },
      },
      {
        id: 'wing',
        label: () => 'Wing it with confidence',
        hint: () => 'Risky — charisma decides',
        resolve: async (ctx, p) => {
          const success = ctx.rng('interview-wing', text(p, 'applicationId')).chance(0.2 + ctx.character.skills.charisma / 100);
          await applications.recordInterview(ctx, text(p, 'applicationId'), success ? 0.15 : -0.15, success ? 'You charmed the panel.' : 'The interview did not go well.');
          return success
            ? { title: 'Smooth operator', body: 'You had the panel laughing. Confidence is a skill.', tone: 'good' }
            : { title: '“Tell us about yourself”', body: 'You froze, then talked about your village for ten minutes. Hmm.', tone: 'bad' };
        },
      },
    ],
    defaultChoiceId: 'wing',
  };

  const bossSaturday: LifeEventDefinition = {
    id: 'boss-wants-saturday',
    domain: 'careers',
    art: '📅',
    weight: 5,
    cooldownDays: 20,
    eligible: async (ctx) => {
      const current = await employed(ctx, 'office');
      return current !== null && !current.job.schedule.days.includes(5);
    },
    prepare: async (ctx) => {
      const current = await employed(ctx);
      return { ref: ctx.time, employer: current ? employerOf(current.job, current.employment) : 'the office', overtime: current ? roundTo(payNaira(ctx, current) * 0.03, 1_000) : 5_000 };
    },
    title: () => 'Oga wants you on Saturday',
    body: (p) => `Your oga at ${text(p, 'employer')}: “We have a deadline. I’ll see you on Saturday, abi?” It wasn’t really a question.`,
    choices: [
      {
        id: 'go',
        label: () => 'Show up on Saturday',
        hint: () => 'Costs your weekend',
        resolve: (ctx) =>
          withJob(ctx, 'You no longer work there.', async (current) => {
            await nudgeGoodwill(ctx, current, 0.08, 0.03);
            adjustNeeds(ctx, { energy: -15, fun: -15 });
            return { title: 'Team player', body: 'You gave up your Saturday. Oga noticed — and remembered.', tone: 'good' };
          }),
      },
      {
        id: 'excuse',
        label: () => '“Sorry sir, I have a family function”',
        resolve: (ctx) =>
          withJob(ctx, 'You no longer work there.', async (current) => {
            await nudgeGoodwill(ctx, current, -0.04);
            return { title: 'Weekend saved', body: 'Oga said “no problem” in the tone that means “problem”.', tone: 'neutral' };
          }),
      },
      {
        id: 'overtime',
        label: (p) => `Ask for overtime pay (${formatNaira(amount(p, 'overtime'))})`,
        hint: () => 'Risky',
        resolve: (ctx, p) =>
          withJob(ctx, 'You no longer work there.', async (current) => {
            if (ctx.rng('overtime', amount(p, 'ref')).chance(0.3 + ctx.character.skills.charisma / 150)) {
              const pay = amount(p, 'overtime');
              await ctx.wallet.receive(pay, 'salary', 'Saturday overtime', `overtime:${current.employment.id}:${amount(p, 'ref')}`, { income: 'earned' });
              await nudgeGoodwill(ctx, current, 0.02, 0.02);
              adjustNeeds(ctx, { energy: -15, fun: -10 });
              return { title: 'Overtime approved', body: 'HR actually paid. Miracles happen.', tone: 'good', moneyDelta: pay };
            }
            await nudgeGoodwill(ctx, current, -0.06);
            return { title: '“Is it by force?”', body: 'Oga laughed you out of his office. You still came on Saturday.', tone: 'bad' };
          }),
      },
    ],
    defaultChoiceId: 'excuse',
  };

  const creditThief: LifeEventDefinition = {
    id: 'colleague-takes-credit',
    domain: 'careers',
    art: '🦹',
    weight: 4,
    cooldownDays: 25,
    eligible: async (ctx) => (await employed(ctx, 'office')) !== null,
    prepare: (ctx) => ({ ref: ctx.time, colleague: ctx.rng('credit-thief', ctx.time).pick(COLLEAGUES) }),
    title: (p) => `${text(p, 'colleague')} took credit for your work`,
    body: (p) => `In the management meeting, ${text(p, 'colleague')} presented YOUR report as theirs. The MD clapped. You’re fuming.`,
    choices: [
      {
        id: 'confront',
        label: () => 'Call it out in the meeting',
        hint: () => 'Charisma decides',
        resolve: (ctx, p) =>
          withJob(ctx, 'You no longer work there.', async (current) => {
            if (ctx.rng('credit-confront', amount(p, 'ref')).chance(0.35 + ctx.character.skills.charisma / 200)) {
              await nudgeGoodwill(ctx, current, 0.05, 0.04);
              return { title: 'Receipts don land', body: 'You pulled up the version history. The MD now knows who did the work.', tone: 'good' };
            }
            await nudgeGoodwill(ctx, current, -0.06);
            moodModifier(ctx, 'office-politics', 'Office politics', -5, 3);
            return { title: 'It backfired', body: 'You came across as bitter. Office politics 1, you 0.', tone: 'bad' };
          }),
      },
      {
        id: 'quiet',
        label: () => 'Quietly forward the email trail to your oga',
        resolve: (ctx, p) =>
          withJob(ctx, 'You no longer work there.', async (current) => {
            const noticed = ctx.rng('credit-quiet', amount(p, 'ref')).chance(0.6);
            if (noticed) await nudgeGoodwill(ctx, current, 0.04, 0.02);
            return noticed
              ? { title: 'Oga saw it', body: 'He replied “Noted 👍🏾”. From him, that’s a standing ovation.', tone: 'good' }
              : { title: 'Left on read', body: 'Your oga never opened the email.', tone: 'neutral' };
          }),
      },
      {
        id: 'let-go',
        label: () => 'Let it slide — God dey',
        resolve: async (ctx) => {
          moodModifier(ctx, 'credit-stolen', 'Someone stole your credit', -6, 3);
          return { title: 'You let it go', body: 'Peace of mind, small pain in the chest.', tone: 'neutral' };
        },
      },
    ],
    defaultChoiceId: 'let-go',
  };

  const somethingForTheBoys: LifeEventDefinition = {
    id: 'something-for-the-boys',
    domain: 'careers',
    art: '✉️',
    weight: 3,
    cooldownDays: 40,
    eligible: async (ctx) => (await employed(ctx, 'kickback')) !== null,
    prepare: async (ctx) => {
      const current = await employed(ctx);
      const base = current ? payNaira(ctx, current) : 100_000;
      return { ref: ctx.time, amount: roundTo(base * ctx.rng('kickback', ctx.time).float(0.5, 1.5), 5_000) };
    },
    title: () => '“Something for the boys”',
    body: (p) =>
      `A contractor slides an envelope across your desk — ${formatNaira(amount(p, 'amount'))} — “just to make the file move faster. Everybody dey do am.”`,
    choices: [
      {
        id: 'take',
        label: () => 'Collect am',
        hint: () => 'Risky — audits happen',
        resolve: (ctx, p) =>
          withJob(ctx, 'You no longer work there.', async (current) => {
            const cash = amount(p, 'amount');
            const key = `kickback:${current.employment.id}:${amount(p, 'ref')}`;
            await ctx.wallet.receive(cash, 'event-reward', 'Envelope from a contractor', key, { income: 'unearned' });
            if (ctx.rng('kickback-audit', amount(p, 'ref')).chance(0.2)) {
              const refund = Math.min(ctx.wallet.cash, cash * 2);
              await ctx.wallet.tryPay(refund, 'fine', 'Refund and penalty after the audit', `${key}:penalty`);
              await employmentService.end(ctx, current.employment, 'fired');
              return { title: 'Audit don catch you', body: 'Internal audit traced the envelope. You refunded double and HR walked you out.', tone: 'bad', moneyDelta: cash - refund };
            }
            return { title: 'Envelope collected', body: 'Nobody noticed… this time.', tone: 'neutral', moneyDelta: cash };
          }),
      },
      {
        id: 'refuse',
        label: () => 'Refuse politely',
        resolve: (ctx) =>
          withJob(ctx, 'You no longer work there.', async (current) => {
            await nudgeGoodwill(ctx, current, 0.02);
            addConnections(ctx, -1);
            return { title: 'Clean hands', body: 'The contractor hissed. The boys are not happy, but you sleep well.', tone: 'good' };
          }),
      },
      {
        id: 'report',
        label: () => 'Report it to compliance',
        resolve: (ctx) =>
          withJob(ctx, 'You no longer work there.', async (current) => {
            await nudgeGoodwill(ctx, current, 0.06, 0.02);
            addConnections(ctx, -3);
            return { title: 'Whistleblower', body: 'Management praised your integrity. Some colleagues have stopped greeting you.', tone: 'good' };
          }),
      },
    ],
    defaultChoiceId: 'refuse',
  };

  const headhunter: LifeEventDefinition = {
    id: 'headhunter-offer',
    domain: 'careers',
    art: '🎯',
    weight: 3,
    cooldownDays: 60,
    eligible: async (ctx) => {
      const current = await employed(ctx, 'headhunt');
      if (!current) return false;
      const next = current.job.levels[current.employment.level + 1];
      return next !== undefined && !next.breakout && current.employment.performance >= 0.65 && ctx.time - current.employment.levelStartedAt >= MINUTES_PER_YEAR / 2;
    },
    prepare: async (ctx) => {
      const current = await employed(ctx);
      const rng = ctx.rng('headhunter', ctx.time);
      const next = current ? current.job.levels[current.employment.level + 1] : undefined;
      return { ref: ctx.time, rival: rng.pick(RIVALS), nextTitle: next?.title ?? 'a bigger role', raise: Math.round(rng.float(0.1, 0.2) * 100) / 100 };
    },
    title: (p) => `${text(p, 'rival')} wants you`,
    body: (p) => `A headhunter slid into your DMs: “${text(p, 'rival')} is looking for a ${text(p, 'nextTitle')}. Are you open to a conversation?”`,
    choices: [
      {
        id: 'jump',
        label: (p) => `Jump ship — become ${text(p, 'nextTitle')} at ${text(p, 'rival')}`,
        resolve: (ctx, p) =>
          withJob(ctx, 'The offer expired.', async (current) => {
            current.employment.employerOverride = text(p, 'rival');
            current.employment.goodwill = 0;
            await promotions.promote(ctx, current.employment, current.job, 'headhunt');
            return { title: 'New office, new title', body: `You resigned with a smile and resumed at ${text(p, 'rival')}.`, tone: 'good' };
          }),
      },
      {
        id: 'counter',
        label: () => 'Use it to negotiate a counter-offer',
        hint: () => 'Charisma decides',
        resolve: (ctx, p) =>
          withJob(ctx, 'The offer expired.', async (current) => {
            if (ctx.rng('counter-offer', amount(p, 'ref')).chance(0.4 + ctx.character.skills.charisma / 200)) {
              current.employment.payAdjustment = Math.round(current.employment.payAdjustment * (1 + amount(p, 'raise')) * 100) / 100;
              await store.save(ctx, current.employment);
              return { title: 'Counter-offer accepted', body: `Management matched it: a ${Math.round(amount(p, 'raise') * 100)}% raise to keep you.`, tone: 'good' };
            }
            await nudgeGoodwill(ctx, current, -0.05);
            return { title: '“Then go”', body: 'Your oga called your bluff. Awkward.', tone: 'bad' };
          }),
      },
      {
        id: 'stay',
        label: () => 'Stay loyal',
        resolve: (ctx) =>
          withJob(ctx, 'The offer expired.', async (current) => {
            await nudgeGoodwill(ctx, current, 0.03);
            return { title: 'Loyalty', body: 'You politely declined. Word got back to your oga — he was touched.', tone: 'neutral' };
          }),
      },
    ],
    defaultChoiceId: 'stay',
  };

  const salaryDelay: LifeEventDefinition = {
    id: 'civil-service-salary-delay',
    domain: 'careers',
    art: '⏳',
    weight: 4,
    cooldownDays: 60,
    eligible: async (ctx) => {
      const current = await employed(ctx, 'public-service');
      return current !== null && current.employment.salaryDelayDays === 0 && current.employment.heldPayslip === null;
    },
    prepare: (ctx) => ({ days: ctx.rng('salary-delay', ctx.time).int(5, 20) }),
    title: () => 'Salary delay rumours',
    body: (p) => `The ministry WhatsApp group is buzzing: “This month’s salary go late by about ${amount(p, 'days')} days. Exercise patience.”`,
    choices: [
      {
        id: 'wait',
        label: () => 'Wait patiently — e go better',
        resolve: (ctx, p) =>
          withJob(ctx, 'You no longer work there.', async (current) => {
            current.employment.salaryDelayDays = amount(p, 'days');
            await store.save(ctx, current.employment);
            moodModifier(ctx, 'salary-delay', 'Salary delay', -4, 5);
            return { title: 'Patience', body: 'You tightened your belt and waited.', tone: 'neutral' };
          }),
      },
      {
        id: 'protest',
        label: () => 'Join the union protest at Alausa',
        hint: () => 'Shorter delay, oga won’t love it',
        resolve: (ctx, p) =>
          withJob(ctx, 'You no longer work there.', async (current) => {
            current.employment.salaryDelayDays = Math.ceil(amount(p, 'days') / 2);
            await nudgeGoodwill(ctx, current, -0.03);
            addConnections(ctx, 2);
            return { title: 'Aluta continua', body: 'The protest made the evening news. Payment was brought forward.', tone: 'good' };
          }),
      },
    ],
    defaultChoiceId: 'wait',
  };

  const breakout: LifeEventDefinition = {
    id: 'creative-breakout',
    domain: 'careers',
    art: '🔥',
    weight: 6,
    cooldownDays: 30,
    eligible: async (ctx) => {
      const current = await employed(ctx);
      if (!current || !(current.job.traits.includes('music') || current.job.traits.includes('viral'))) return false;
      const next = current.job.levels[current.employment.level + 1];
      const { creative, charisma } = ctx.character.skills;
      if (!next?.breakout || creative < 35 || charisma < 25) return false;
      return ctx.rng('breakout-gate', Math.floor(ctx.time / MINUTES_PER_DAY)).chance(0.04 + (creative - 35) / 600);
    },
    prepare: async (ctx) => {
      const current = await employed(ctx);
      const rng = ctx.rng('breakout', ctx.time);
      const next = current ? current.job.levels[current.employment.level + 1] : undefined;
      return {
        ref: ctx.time,
        kind: current?.job.traits.includes('music') ? 'music' : 'viral',
        song: rng.pick(SONGS),
        nextTitle: next?.title ?? 'a star',
        advance: roundTo((next?.pay ?? 500_000) * rng.float(1.5, 3), 100_000),
      };
    },
    title: (p) => (text(p, 'kind') === 'music' ? `“${text(p, 'song')}” don blow! 🎶` : 'Your skit don go viral! 📈'),
    body: (p) =>
      text(p, 'kind') === 'music'
        ? `DJs are spinning “${text(p, 'song')}” in every club from Ikeja to Lekki. Labels are calling. This is the moment.`
        : 'Five million views overnight. Brands are in your DMs and your phone won’t stop buzzing.',
    choices: [
      {
        id: 'sign',
        label: (p) => (text(p, 'kind') === 'music' ? `Sign with a major label (${formatNaira(amount(p, 'advance'))} advance)` : `Sign with a talent agency (${formatNaira(amount(p, 'advance'))} upfront)`),
        hint: () => 'Big cheque now, they keep a cut',
        resolve: (ctx, p) =>
          withJob(ctx, 'The moment passed.', async (current) => {
            current.employment.payAdjustment = Math.round(current.employment.payAdjustment * 0.75 * 100) / 100;
            await ctx.wallet.receive(amount(p, 'advance'), 'event-reward', 'Signing advance', `breakout-advance:${current.employment.id}:${amount(p, 'ref')}`, { income: 'earned' });
            await promotions.promote(ctx, current.employment, current.job, 'breakout');
            return { title: 'Signed!', body: `You’re now ${text(p, 'nextTitle')}. The advance has landed — the label takes 25% from here on.`, tone: 'good', moneyDelta: amount(p, 'advance') };
          }),
      },
      {
        id: 'independent',
        label: () => 'Stay independent — own your masters',
        resolve: (ctx, p) =>
          withJob(ctx, 'The moment passed.', async (current) => {
            await promotions.promote(ctx, current.employment, current.job, 'breakout');
            return { title: 'Independent and winning', body: `You’re now ${text(p, 'nextTitle')} — every kobo is yours.`, tone: 'good' };
          }),
      },
    ],
    defaultChoiceId: 'independent',
  };

  const japaRecruiter: LifeEventDefinition = {
    id: 'japa-recruiter',
    domain: 'careers',
    art: '✈️',
    weight: 4,
    cooldownDays: 90,
    eligible: async (ctx) => {
      const current = await employed(ctx, 'health');
      return current !== null && ctx.time - current.employment.startedAt >= MINUTES_PER_YEAR / 2;
    },
    prepare: async (ctx) => {
      const current = await employed(ctx);
      const rng = ctx.rng('japa', ctx.time);
      return { ref: ctx.time, destination: rng.pick(DESTINATIONS), locum: current ? roundTo(payNaira(ctx, current) * rng.float(0.1, 0.2), 1_000) : 20_000 };
    },
    title: () => 'Japa recruiter in your DMs',
    body: (p) =>
      `“Hello Doc/Nurse, we have urgent openings in ${text(p, 'destination')}. Visa sponsorship, relocation, salary in pounds.” Half your colleagues have already left.`,
    choices: [
      {
        id: 'leverage',
        label: () => 'Use the offer to ask management for a raise',
        hint: () => 'Charisma decides',
        resolve: (ctx, p) =>
          withJob(ctx, 'You no longer work there.', async (current) => {
            if (ctx.rng('japa-leverage', amount(p, 'ref')).chance(0.35 + ctx.character.skills.charisma / 250)) {
              current.employment.payAdjustment = Math.round(current.employment.payAdjustment * 1.15 * 100) / 100;
              await store.save(ctx, current.employment);
              return { title: 'Retention allowance', body: 'Management can’t afford to lose another hand — you got a 15% raise.', tone: 'good' };
            }
            return { title: '“We can’t match it”', body: 'HR wished you well. Nothing changed.', tone: 'neutral' };
          }),
      },
      {
        id: 'locum',
        label: (p) => `Do weekend locum shifts instead (+${formatNaira(amount(p, 'locum'))})`,
        hint: () => 'Tiring',
        resolve: (ctx, p) =>
          withJob(ctx, 'You no longer work there.', async (current) => {
            const pay = amount(p, 'locum');
            await ctx.wallet.receive(pay, 'hustle', 'Weekend locum shifts', `locum:${current.employment.id}:${amount(p, 'ref')}`, { income: 'earned' });
            adjustNeeds(ctx, { energy: -20, fun: -10 });
            return { title: 'Locum money', body: 'Two private clinics, two weekends, one tired body.', tone: 'good', moneyDelta: pay };
          }),
      },
      {
        id: 'stay',
        label: () => 'Ignore it — Naija go better',
        resolve: async (ctx) => {
          moodModifier(ctx, 'patriot', 'Staying to build Naija', 3, 3);
          return { title: 'Staying put', body: 'Your mum is relieved. Your colleagues think you’re brave — or mad.', tone: 'neutral' };
        },
      },
    ],
    defaultChoiceId: 'stay',
  };

  const officeOwambe: LifeEventDefinition = {
    id: 'office-owambe',
    domain: 'careers',
    art: '🎊',
    weight: 4,
    cooldownDays: 30,
    eligible: async (ctx) => (await employed(ctx, 'office')) !== null,
    prepare: (ctx) => {
      const rng = ctx.rng('office-owambe', ctx.time);
      return { ref: ctx.time, colleague: rng.pick(COLLEAGUES), cost: ctx.world.price(rng.int(15, 45) * 1_000, ctx.time) };
    },
    title: (p) => `${text(p, 'colleague')}’s wedding — office aso-ebi`,
    body: (p) =>
      `The office WhatsApp group: “${text(p, 'colleague')} is getting married! Aso-ebi plus contribution is ${formatNaira(amount(p, 'cost'))}. Kindly indicate.”`,
    choices: [
      {
        id: 'full',
        label: (p) => `Buy the aso-ebi and dance (${formatNaira(amount(p, 'cost'))})`,
        unavailable: (ctx, p) => cantAfford(ctx, amount(p, 'cost')),
        resolve: (ctx, p) =>
          withJob(ctx, 'You no longer work there.', async (current) => {
            const cost = amount(p, 'cost');
            await ctx.wallet.pay(cost, 'ceremony', `Aso-ebi for ${text(p, 'colleague')}’s wedding`, `office-owambe:${current.employment.id}:${amount(p, 'ref')}`);
            await nudgeGoodwill(ctx, current, 0.03);
            addConnections(ctx, 2);
            adjustNeeds(ctx, { social: 20, fun: 15 });
            return { title: 'You showed up and showed out', body: 'Matching gele, jollof, and you sprayed with style. Colleagues love you.', tone: 'good', moneyDelta: -cost };
          }),
      },
      {
        id: 'token',
        label: () => 'Send ₦5,000 and your best wishes',
        unavailable: (ctx) => cantAfford(ctx, 5_000),
        resolve: (ctx, p) =>
          withJob(ctx, 'You no longer work there.', async (current) => {
            await ctx.wallet.pay(5_000, 'ceremony', `Wedding contribution for ${text(p, 'colleague')}`, `office-owambe:${current.employment.id}:${amount(p, 'ref')}`);
            addConnections(ctx, 0.5);
            return { title: 'Token of love', body: '“Thank you dear 🙏🏾” — a polite reply.', tone: 'neutral', moneyDelta: -5_000 };
          }),
      },
      {
        id: 'ghost',
        label: () => 'Ghost the WhatsApp group',
        resolve: (ctx) =>
          withJob(ctx, 'You no longer work there.', async (current) => {
            await nudgeGoodwill(ctx, current, -0.02);
            return { title: 'Seen, no reply', body: 'People noticed your name missing from the list.', tone: 'neutral' };
          }),
      },
    ],
    defaultChoiceId: 'ghost',
  };

  return [interview, bossSaturday, creditThief, somethingForTheBoys, headhunter, salaryDelay, breakout, japaRecruiter, officeOwambe];
}
