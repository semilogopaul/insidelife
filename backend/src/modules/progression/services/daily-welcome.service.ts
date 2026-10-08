import { Injectable } from '@nestjs/common';
import {
  DAILY_WELCOME_FLAVOURS,
  DAILY_WELCOME_MOOD_MINUTES,
  dailyWelcomeFlavourFor,
  formatNaira,
  type DailyWelcomeFlavour,
  type DailyWelcomeFlavourDto,
  type DailyWelcomeResultDto,
  type DailyWelcomeStatusDto,
} from '@insidelife/shared';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { dailyWelcomeGift, lagosDay, nextLagosMidnight } from '../progression.rules.js';
import { DailyWelcomeClaimStore } from './daily-welcome-claims.store.js';

/** Mood modifier id (a fresh claim replaces any leftover boost instead of stacking). */
export const DAILY_WELCOME_MODIFIER_ID = 'daily-welcome';

const FLAVOURS: readonly DailyWelcomeFlavour[] = DAILY_WELCOME_FLAVOURS;

/**
 * The daily welcome: once per real Africa/Lagos calendar day per account, a weekday-flavoured mood boost plus a
 * little cash from home (≤ ₦20,000, unearned). Deliberately no streaks — missing a day costs nothing.
 */
@Injectable()
export class DailyWelcomeService {
  constructor(private readonly claims: DailyWelcomeClaimStore) {}

  async status(ctx: SimulationContext, userId: string, nowMs: number): Promise<DailyWelcomeStatusDto> {
    const day = lagosDay(nowMs);
    const claim = await this.claims.find(ctx.manager, userId, day.date);
    return { claimedToday: claim !== null, realDate: day.date, nextResetAt: new Date(nextLagosMidnight(nowMs)).toISOString() };
  }

  async claim(ctx: SimulationContext, userId: string, nowMs: number): Promise<DailyWelcomeResultDto> {
    const day = lagosDay(nowMs);
    const nextResetAt = new Date(nextLagosMidnight(nowMs)).toISOString();
    const gift = dailyWelcomeGift(ctx.character.seed, day);
    const claimed = await this.claims.tryInsert(ctx.manager, {
      userId,
      characterId: ctx.character.id,
      realDate: day.date,
      flavourId: gift.flavour.id,
      cash: gift.cash,
      moodBoost: gift.flavour.mood,
      gameMinute: ctx.time,
    });

    if (!claimed) {
      const existing = await this.claims.find(ctx.manager, userId, day.date);
      const flavour = FLAVOURS.find((candidate) => candidate.id === existing?.flavourId) ?? dailyWelcomeFlavourFor(day.weekday);
      return { status: 'already-claimed', realDate: day.date, nextResetAt, flavour: flavourDto(flavour), cash: existing?.cash ?? 0, mood: null };
    }

    const { flavour, cash } = gift;
    await ctx.wallet.receive(cash, 'gift', `${flavour.title} — love from home`, `daily-welcome:${day.date}`, { income: 'unearned' });
    const mood = { label: flavour.title, value: flavour.mood, until: ctx.time + DAILY_WELCOME_MOOD_MINUTES };
    ctx.character.moodModifiers = [
      ...ctx.character.moodModifiers.filter((modifier) => modifier.id !== DAILY_WELCOME_MODIFIER_ID),
      { id: DAILY_WELCOME_MODIFIER_ID, ...mood },
    ];
    ctx.notify({ kind: 'family', title: flavour.title, body: `${flavour.body} +${formatNaira(cash)}`, tone: 'good', amount: cash });
    return { status: 'granted', realDate: day.date, nextResetAt, flavour: flavourDto(flavour), cash, mood };
  }
}

function flavourDto(flavour: DailyWelcomeFlavour): DailyWelcomeFlavourDto {
  return { id: flavour.id, title: flavour.title, body: flavour.body, emoji: flavour.emoji, icon: flavour.icon };
}
