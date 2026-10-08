import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  LIFESTYLES,
  LIFESTYLE_TIERS,
  MINUTES_PER_DAY,
  formatNaira,
  type LifestyleTier,
  type ProfileContext,
} from '@insidelife/shared';
import type { SimulationSystem } from '../interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation-context.js';
import { SimulationRegistry } from '../simulation-registry.service.js';

const BROKE_MODIFIER = 'broke';
/** Completely broke: meals at home are garri and sugar — they keep you going but never fill you up. */
const BROKE_MEAL_TARGET = 55;

/**
 * Daily living costs by lifestyle tier — the main wealth-scaled sink. If the character can't pay, they slide down a
 * tier ("Sapa don catch you") instead of going into debt; at the bottom tier, going hungry hurts mood.
 */
@Injectable()
export class LifestyleSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'lifestyle';
  readonly order = 10;

  constructor(private readonly registry: SimulationRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async profileContext(ctx: SimulationContext, base: ProfileContext): Promise<ProfileContext> {
    const broke = ctx.character.moodModifiers.some((modifier) => modifier.id === BROKE_MODIFIER && modifier.until > ctx.time);
    return { ...base, comfort: LIFESTYLES[ctx.character.lifestyle].comfort, mealTarget: broke ? BROKE_MEAL_TARGET : 100 };
  }

  async status(ctx: SimulationContext): Promise<number> {
    return LIFESTYLES[ctx.character.lifestyle].status;
  }

  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const character = ctx.character;
    let multiplier = 1;
    for (const system of this.registry.all) multiplier *= (await system.livingCostMultiplier?.(ctx)) ?? 1;
    const priceIndex = ctx.world.economy(ctx.time).priceIndex;

    let tier: LifestyleTier = character.lifestyle;
    for (;;) {
      const cost = Math.round(LIFESTYLES[tier].dailyCost * priceIndex * multiplier);
      const paid = ctx.wallet.tryAccrue(cost, 'living-cost', `${LIFESTYLES[tier].label} living`, `living:${dayIndex}`);
      if (paid) break;
      const lower = LIFESTYLE_TIERS[LIFESTYLE_TIERS.indexOf(tier) - 1];
      if (!lower) {
        this.goHungry(ctx);
        break;
      }
      tier = lower;
    }

    if (tier !== character.lifestyle) {
      ctx.notify({
        kind: 'bill',
        title: 'Sapa don catch you',
        body: `You couldn’t afford ${LIFESTYLES[character.lifestyle].label}, so you’ve dropped to ${LIFESTYLES[tier].label}.`,
        tone: 'bad',
      });
      ctx.report({ label: `Dropped to ${LIFESTYLES[tier].label} lifestyle`, tone: 'bad' });
      character.lifestyle = tier;
      ctx.invalidate('profile-context');
    }
  }

  private goHungry(ctx: SimulationContext): void {
    const character = ctx.character;
    character.needs = { ...character.needs, hunger: Math.min(character.needs.hunger, 20) };
    character.moodModifiers = [
      ...character.moodModifiers.filter((modifier) => modifier.id !== BROKE_MODIFIER),
      { id: BROKE_MODIFIER, label: 'Completely broke', value: -15, until: ctx.time + MINUTES_PER_DAY },
    ];
    ctx.invalidate('profile-context');
    if (ctx.rng('broke-notice', Math.floor(ctx.time / MINUTES_PER_DAY)).chance(0.3)) {
      ctx.notify({
        kind: 'bill',
        title: 'Garri and sugar again',
        body: `You can’t even afford ${formatNaira(LIFESTYLES.sapa.dailyCost)} for food today. Find a hustle — fast.`,
        tone: 'bad',
      });
    }
  }
}
