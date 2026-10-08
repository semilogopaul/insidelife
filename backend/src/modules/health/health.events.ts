import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  CONDITIONS,
  MINUTES_PER_DAY,
  MOSQUITO_NET_ITEM_ID,
  MOSQUITO_NET_TAG,
  doctorsStrikeAt,
  formatNaira,
  seasonOf,
} from '@insidelife/shared';
import { DomainException } from '../../common/exceptions/domain.exception.js';
import { INVENTORY_PORT, type InventoryPort } from '../../common/ports/inventory.port.js';
import type { LifeEventDefinition, LifeEventOutcome, LifeEventParams } from '../events/interfaces/life-event.interface.js';
import { LifeEventsRegistry } from '../events/life-events.registry.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { ConditionsService } from './conditions.service.js';
import type { HealthConditionEntity } from './entities/health-condition.entity.js';
import { HealthProfileService } from './health-profile.service.js';
import { MEDICATION_PERIOD } from './health.constants.js';
import { setMoodModifier } from './mood-modifiers.js';

const NET_PRICE = 7_500;
const FUMIGATION_PRICE = 15_000;
const VERIFIED_PHARMACY_PRICE = 5_000;
const FIRST_AID_KIT_PRICE = 10_000;
const GYM_PROMO_PRICE = 10_000;
/** A treated net lasts about three years; fumigation a season. */
const NET_DAYS = 3 * 360;

const amount = (params: LifeEventParams, key: string): number => Number(params[key] ?? 0);

/** Health life-event cards: malaria season, fake drugs, doctors' strikes, outreach, gym promos, BP, traffic stress. */
@Injectable()
export class HealthEvents implements OnModuleInit {
  constructor(
    private readonly registry: LifeEventsRegistry,
    private readonly conditions: ConditionsService,
    private readonly profiles: HealthProfileService,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      this.mosquitoSeason(),
      this.fakeDrugsScare(),
      this.doctorsStrike(),
      this.medicalOutreach(),
      this.gymPromo(),
      this.bloodPressure(),
      this.trafficStress(),
    );
  }

  private mosquitoSeason(): LifeEventDefinition {
    return {
      id: 'health-mosquito-net',
      domain: 'health',
      art: '🦟',
      weight: 6,
      cooldownDays: 60,
      eligible: async (ctx) => {
        const season = seasonOf(ctx.time);
        if (season !== 'rainy' && season !== 'august-break') return false;
        const profile = await this.profiles.get(ctx);
        if (this.profiles.isProtected(profile, 'bed-net', ctx.time) || this.profiles.isProtected(profile, 'fumigated', ctx.time)) return false;
        return !(await this.inventory.hasTag(ctx, MOSQUITO_NET_TAG));
      },
      prepare: (ctx) => ({ net: ctx.world.price(NET_PRICE, ctx.time), fumigation: ctx.world.price(FUMIGATION_PRICE, ctx.time) }),
      title: () => 'Mosquito season don land',
      body: () => 'The rains have filled every gutter and the mosquitoes are holding night vigils in your room. Malaria cases are up all over Lagos.',
      choices: [
        {
          id: 'buy-net',
          label: (params) => `Buy a treated mosquito net (${formatNaira(amount(params, 'net'))})`,
          hint: () => 'Stops most bites for years',
          unavailable: (ctx, params) => this.unaffordable(ctx, amount(params, 'net')),
          resolve: async (ctx, params) => {
            const price = amount(params, 'net');
            await ctx.wallet.pay(price, 'purchase', 'Insecticide-treated mosquito net', `event:mosquito-net:${ctx.time}`);
            await this.giveNet(ctx);
            return { title: 'Sleeping like royalty', body: 'No more buzzing in your ear at 2am. The mosquitoes have relocated to your neighbour.', tone: 'good', moneyDelta: -price };
          },
        },
        {
          id: 'fumigate',
          label: (params) => `Fumigate the house (${formatNaira(amount(params, 'fumigation'))})`,
          hint: () => 'Fewer mosquitoes for 3 months',
          unavailable: (ctx, params) => this.unaffordable(ctx, amount(params, 'fumigation')),
          resolve: async (ctx, params) => {
            const price = amount(params, 'fumigation');
            await ctx.wallet.pay(price, 'purchase', 'House fumigation', `event:fumigation:${ctx.time}`);
            await this.profiles.protect(ctx, 'fumigated', 90);
            return { title: 'The house smells like chemicals', body: 'But the mosquitoes are gone. For now.', tone: 'good', moneyDelta: -price };
          },
        },
        {
          id: 'pray',
          label: () => 'Na God dey protect',
          hint: () => 'Free — and risky',
          resolve: async () => ({ title: 'Faith over insecticide', body: 'The mosquitoes heard your prayer. They are also praying.', tone: 'neutral' }),
        },
      ],
      defaultChoiceId: 'pray',
    };
  }

  private fakeDrugsScare(): LifeEventDefinition {
    return {
      id: 'health-fake-drugs',
      domain: 'health',
      art: '💊',
      weight: 3,
      cooldownDays: 120,
      eligible: async (ctx) => !this.profiles.isProtected(await this.profiles.get(ctx), 'trusted-pharmacy', ctx.time),
      prepare: (ctx) => ({ price: ctx.world.price(VERIFIED_PHARMACY_PRICE, ctx.time) }),
      title: () => 'NAFDAC alert: fake antimalarials',
      body: () => 'NAFDAC says fake antimalarials and antibiotics are flooding Lagos markets. Your neighbour still swears by the ₦500 ones from the bus stop.',
      choices: [
        {
          id: 'registered',
          label: (params) => `Register with a verified pharmacist (${formatNaira(amount(params, 'price'))})`,
          hint: () => 'No fake drugs for 6 months',
          unavailable: (ctx, params) => this.unaffordable(ctx, amount(params, 'price')),
          resolve: async (ctx, params) => {
            const price = amount(params, 'price');
            await ctx.wallet.pay(price, 'health', 'Verified pharmacy card', `event:verified-pharmacy:${ctx.time}`);
            await this.profiles.protect(ctx, 'trusted-pharmacy', 180);
            return { title: 'Original drugs only', body: 'Your pharmacist now scans every pack in front of you. Peace of mind.', tone: 'good', moneyDelta: -price };
          },
        },
        {
          id: 'ignore',
          label: () => 'Drugs are drugs',
          hint: () => 'Pharmacy treatments may be fake',
          resolve: async () => ({ title: 'Hmm', body: 'Your neighbour is on his third malaria treatment this month.', tone: 'neutral' }),
        },
      ],
      defaultChoiceId: 'ignore',
    };
  }

  private doctorsStrike(): LifeEventDefinition {
    return {
      id: 'health-doctors-strike',
      domain: 'health',
      art: '🩺',
      weight: 10,
      cooldownDays: 45,
      eligible: (ctx) => doctorsStrikeAt(ctx.world.seed, ctx.time) !== null,
      prepare: (ctx) => ({ kit: ctx.world.price(FIRST_AID_KIT_PRICE, ctx.time) }),
      title: () => 'Resident doctors don strike',
      body: () =>
        'NARD has declared an indefinite strike. Public hospitals are running skeleton services — queues are twice as long and outcomes are worse. Private hospitals are open, at private prices.',
      choices: [
        {
          id: 'first-aid',
          label: (params) => `Buy a proper first-aid kit (${formatNaira(amount(params, 'kit'))})`,
          hint: () => 'Injuries hurt less for 4 months',
          unavailable: (ctx, params) => this.unaffordable(ctx, amount(params, 'kit')),
          resolve: async (ctx, params) => {
            const price = amount(params, 'kit');
            await ctx.wallet.pay(price, 'purchase', 'First-aid kit', `event:first-aid:${ctx.time}`);
            await this.profiles.protect(ctx, 'first-aid', 120);
            return { title: 'Prepared', body: 'Plasters, bandages, antiseptic and paracetamol. You are now the street’s unofficial nurse.', tone: 'good', moneyDelta: -price };
          },
        },
        {
          id: 'noted',
          label: () => 'Pray you don’t fall sick',
          resolve: async () => ({ title: 'Noted', body: 'If you fall sick during the strike, a private hospital or the pharmacy will be faster.', tone: 'neutral' }),
        },
      ],
      defaultChoiceId: 'noted',
    };
  }

  private medicalOutreach(): LifeEventDefinition {
    return {
      id: 'health-medical-outreach',
      domain: 'health',
      art: '⛑️',
      weight: 4,
      cooldownDays: 60,
      eligible: () => true,
      title: () => 'Free medical outreach',
      body: () =>
        'A church and an NGO are running a free medical outreach at the town hall: BP checks, malaria tests, blood sugar and free drugs. The queue starts at 6am.',
      choices: [
        {
          id: 'attend',
          label: () => 'Join the queue',
          hint: () => 'Free check-up',
          resolve: async (ctx) => this.attendOutreach(ctx),
        },
        {
          id: 'skip',
          label: () => 'No time, I dey hustle',
          resolve: async () => ({ title: 'Maybe next time', body: 'The outreach team packed up at 4pm. They’ll be back next quarter.', tone: 'neutral' }),
        },
      ],
      defaultChoiceId: 'skip',
    };
  }

  private gymPromo(): LifeEventDefinition {
    return {
      id: 'health-gym-promo',
      domain: 'health',
      art: '🏋️',
      weight: 4,
      cooldownDays: 90,
      eligible: (ctx) => ctx.character.fitness < 60,
      prepare: (ctx) => ({ price: ctx.world.price(GYM_PROMO_PRICE, ctx.time) }),
      title: () => 'Gym promo: first month half price',
      body: () => 'Iron Paradise Gym is running a “New Year, New Body” promo (it’s not even January). Half price for a month, free fitness assessment.',
      choices: [
        {
          id: 'sign-up',
          label: (params) => `Sign up (${formatNaira(amount(params, 'price'))})`,
          hint: () => '+fitness, +health',
          unavailable: (ctx, params) => this.unaffordable(ctx, amount(params, 'price')),
          resolve: async (ctx, params) => {
            const price = amount(params, 'price');
            await ctx.wallet.pay(price, 'purchase', 'Gym promo membership', `event:gym-promo:${ctx.time}`);
            ctx.character.fitness = Math.min(100, ctx.character.fitness + 4);
            ctx.character.health = Math.min(100, ctx.character.health + 1);
            setMoodModifier(ctx, { id: 'fresh-gains', label: 'Fresh gains', value: 5, until: ctx.time + 3 * MINUTES_PER_DAY });
            return { title: 'Progress!', body: 'Two weeks in and you climbed three flights of stairs without stopping.', tone: 'good', moneyDelta: -price };
          },
        },
        {
          id: 'later',
          label: () => 'Next year, by God’s grace',
          resolve: async () => ({ title: 'The promo ended', body: 'Your belly remains undefeated.', tone: 'neutral' }),
        },
      ],
      defaultChoiceId: 'later',
    };
  }

  private bloodPressure(): LifeEventDefinition {
    const drugs = CONDITIONS.hypertension.monthlyMedication ?? 0;
    return {
      id: 'health-bp-high',
      domain: 'health',
      art: '🫀',
      weight: 6,
      cooldownDays: 60,
      eligible: async (ctx) => ctx.age >= 35 && (await this.conditions.find(ctx, 'hypertension'))?.status === 'active',
      prepare: async (ctx) => ({
        undiagnosed: !(await this.conditions.find(ctx, 'hypertension'))?.diagnosed,
        drugs: ctx.world.price(drugs, ctx.time),
      }),
      title: () => 'Your BP is high — reduce salt',
      body: (params) =>
        params.undiagnosed
          ? 'A nurse doing free BP checks outside church caught you: 160/100. “Ah, this one is high o. Reduce salt and see a doctor.”'
          : 'Your BP reading is up again. The doctor’s voice is in your head: “Less salt, less Maggi, more walking.”',
      choices: [
        {
          id: 'low-salt',
          label: () => 'Cut the salt and Maggi',
          hint: () => 'Slows it down for 3 months',
          resolve: async (ctx) => {
            await this.diagnoseHypertension(ctx);
            await this.profiles.protect(ctx, 'low-salt', 90);
            setMoodModifier(ctx, { id: 'bland-food', label: 'Bland food', value: -2, until: ctx.time + 3 * MINUTES_PER_DAY });
            return { title: 'Bland but brave', body: 'Your stew tastes like hospital food, but your heart is thanking you.', tone: 'good' };
          },
        },
        {
          id: 'buy-drugs',
          label: (params) => `Buy BP tablets for a month (${formatNaira(amount(params, 'drugs'))})`,
          hint: () => 'Brings it under control',
          unavailable: (ctx, params) => this.unaffordable(ctx, amount(params, 'drugs')),
          resolve: async (ctx, params) => {
            const price = amount(params, 'drugs');
            await ctx.wallet.pay(price, 'health', 'Blood pressure tablets (1 month)', `event:bp-drugs:${ctx.time}`);
            const condition = await this.diagnoseHypertension(ctx);
            if (condition) await this.conditions.manage(ctx, condition, ctx.time + MEDICATION_PERIOD);
            return { title: 'BP under control', body: 'One tablet every morning. It refills monthly — don’t stop when you feel fine.', tone: 'good', moneyDelta: -price };
          },
        },
        {
          id: 'ignore',
          label: () => 'Abeg, I’m fine',
          resolve: async (ctx) => {
            await this.diagnoseHypertension(ctx);
            return { title: 'Your BP is not impressed', body: 'High blood pressure is called the silent killer for a reason. The Health app can treat it whenever you’re ready.', tone: 'bad' };
          },
        },
      ],
      defaultChoiceId: 'ignore',
    };
  }

  private trafficStress(): LifeEventDefinition {
    return {
      id: 'health-traffic-stress',
      domain: 'health',
      art: '🚦',
      weight: 5,
      cooldownDays: 14,
      eligible: (ctx) => ctx.age >= 18 && ctx.character.regionId === 'lagos',
      title: () => 'Lagos traffic stress',
      body: () =>
        'Three hours on Third Mainland Bridge. A danfo scraped a Bolt, both drivers came down to fight, and your bladder has filed a formal complaint.',
      choices: [
        {
          id: 'breathe',
          label: () => 'Breathe, play some Asa and let it go',
          resolve: async (ctx) => {
            setMoodModifier(ctx, { id: 'traffic-zen', label: 'Traffic zen', value: 4, until: ctx.time + MINUTES_PER_DAY });
            await this.profiles.adjustStress(ctx, -2);
            return { title: 'Inner peace', body: '“Jailer” on repeat. Lagos can’t touch you today.', tone: 'good' };
          },
        },
        {
          id: 'rage',
          label: () => 'Shout at everybody',
          resolve: async (ctx) => {
            setMoodModifier(ctx, { id: 'traffic-rage', label: 'Traffic rage', value: -6, until: ctx.time + MINUTES_PER_DAY });
            await this.profiles.adjustStress(ctx, 2);
            return { title: 'You won the argument', body: 'Your blood pressure lost.', tone: 'bad' };
          },
        },
      ],
      defaultChoiceId: 'rage',
    };
  }

  /** Free outreach: test for what a field clinic can, and hand out drugs for the simple stuff. */
  private async attendOutreach(ctx: SimulationContext): Promise<LifeEventOutcome> {
    const found: string[] = [];
    const cured: string[] = [];
    for (const condition of await this.conditions.current(ctx)) {
      const definition = CONDITIONS[condition.conditionId];
      if (!definition.pharmacyDiagnosable) continue;
      await this.conditions.diagnose(ctx, condition, null);
      const simple = condition.severity === 'mild' && (condition.conditionId === 'malaria' || condition.conditionId === 'catarrh');
      if (simple) {
        await this.conditions.recover(ctx, condition, 'treatment');
        cured.push(definition.label.toLowerCase());
      } else {
        found.push(`${definition.label.toLowerCase()} (${condition.severity})`);
      }
    }
    setMoodModifier(ctx, { id: 'outreach-queue', label: 'Long outreach queue', value: -3, until: ctx.time + MINUTES_PER_DAY });
    if (found.length === 0 && cured.length === 0) {
      return { title: 'Clean bill of health', body: 'BP normal, sugar normal, no malaria. The nurse gave you free vitamins and a pamphlet.', tone: 'good' };
    }
    const parts = [
      cured.length > 0 ? `Free drugs sorted your ${cured.join(' and ')}.` : '',
      found.length > 0 ? `They found ${found.join(', ')} — see the Health app for treatment.` : '',
    ];
    return { title: 'Worth the queue', body: parts.filter(Boolean).join(' '), tone: found.length > 0 ? 'neutral' : 'good' };
  }

  private async diagnoseHypertension(ctx: SimulationContext): Promise<HealthConditionEntity | undefined> {
    const condition = await this.conditions.find(ctx, 'hypertension');
    if (condition) await this.conditions.diagnose(ctx, condition, null);
    return condition;
  }

  /** A shop item when the shop stocks it; otherwise the health domain remembers the net itself. */
  private async giveNet(ctx: SimulationContext): Promise<void> {
    try {
      await this.inventory.grant(ctx, MOSQUITO_NET_ITEM_ID);
    } catch (error) {
      // Only an unknown-item rule from the shop is expected here; anything else is a real failure.
      if (!(error instanceof DomainException)) throw error;
    }
    if (!(await this.inventory.hasTag(ctx, MOSQUITO_NET_TAG))) await this.profiles.protect(ctx, 'bed-net', NET_DAYS);
  }

  private unaffordable(ctx: SimulationContext, price: number): string | null {
    return ctx.wallet.canAfford(price) ? null : `You need ${formatNaira(price)} for this`;
  }
}
