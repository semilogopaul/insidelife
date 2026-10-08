import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  MAX_STATUS,
  MINUTES_PER_DAY,
  depositRate,
  formatDate,
  formatNaira,
  formatPercent,
  type Rng,
} from '@insidelife/shared';
import type { LifeEventDefinition, LifeEventOutcome, LifeEventParams } from '../events/interfaces/life-event.interface.js';
import { LifeEventsRegistry } from '../events/life-events.registry.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { DepositsService } from './deposits.service.js';
import { PONZI_PAYOUT_DAYS, PonziService } from './ponzi.service.js';
import { TradingService } from './trading.service.js';

const SCHEMES = ['CryptoBridge Xchange (CBX)', 'MMM Naija Reloaded', 'Loom Money Circle', 'EkoWealth AI Trader', 'Naija Doubler Club'] as const;
const FRIENDS = ['Tunde', 'Chioma', 'Emeka', 'Bisola', 'Musa', 'Kemi', 'Obinna', 'Aisha'] as const;
const BANKS = ['Eko Trust Bank', 'Lagoon Bank', 'Naija First', 'Atlantic MFB'] as const;
const GLITCH_AMOUNT = 500_000;
const EFCC_FINE = 400_000;
const EFCC_CATCH_CHANCE = 0.6;

const num = (params: LifeEventParams, key: string): number => {
  const value = params[key];
  return typeof value === 'number' ? value : Number(value ?? 0);
};
const text = (params: LifeEventParams, key: string): string => String(params[key] ?? '');
const roundTo = (value: number, step: number): number => Math.max(step, Math.round(value / step) * step);
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const eventRng = (ctx: SimulationContext, purpose: string): Rng => ctx.rng(purpose, ctx.time);

const affordable =
  (size: 'small' | 'big') =>
  (ctx: SimulationContext, params: LifeEventParams): string | null =>
    ctx.wallet.cash < num(params, size) ? 'You don’t have that much cash' : null;

function addMood(ctx: SimulationContext, id: string, label: string, value: number, days: number): void {
  ctx.character.moodModifiers = [
    ...ctx.character.moodModifiers.filter((modifier) => modifier.id !== id),
    { id, label, value, until: ctx.time + days * MINUTES_PER_DAY },
  ];
}

function addStatus(ctx: SimulationContext, delta: number): void {
  ctx.character.status = Math.max(0, Math.min(MAX_STATUS, ctx.character.status + delta));
}

/**
 * Money life events: a CBEX-style ponzi pitch, a bank-app glitch that tests your integrity (EFCC risk), the crypto
 * bro, and a T-bill auction tip. Amounts are frozen when the card appears; every ledger key derives from the card's
 * `ref`, so a card's money moves once. Defaults are the safe choice.
 */
@Injectable()
export class InvestmentEvents implements OnModuleInit {
  constructor(
    private readonly registry: LifeEventsRegistry,
    private readonly ponzi: PonziService,
    private readonly trading: TradingService,
    private readonly deposits: DepositsService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.ponziPitch(), this.bankGlitch(), this.cryptoBro(), this.tbillTip());
  }

  private ponziPitch(): LifeEventDefinition {
    const join = async (ctx: SimulationContext, params: LifeEventParams, size: 'small' | 'big'): Promise<LifeEventOutcome> => {
      const amount = num(params, size);
      const scheme = text(params, 'scheme');
      await this.ponzi.join(ctx, scheme, amount, `${text(params, 'ref')}:${size}`);
      return {
        title: `You’re in ${scheme}`,
        body: `The dashboard already shows +3.3% today. Payout of ${formatNaira(amount * 2)} is “guaranteed” in ${PONZI_PAYOUT_DAYS} days.`,
        tone: 'neutral',
        moneyDelta: -amount,
      };
    };

    return {
      id: 'investments-ponzi-pitch',
      domain: 'investments',
      art: '🤑',
      weight: 3,
      cooldownDays: 60,
      eligible: async (ctx) => ctx.age >= 18 && ctx.wallet.cash >= 50_000 && !(await this.ponzi.hasActiveStake(ctx)),
      prepare: (ctx) => {
        const rng = eventRng(ctx, 'ponzi-pitch');
        const small = roundTo(clamp(ctx.wallet.cash * 0.1, 20_000, 1_000_000), 5_000);
        const big = roundTo(clamp(ctx.wallet.cash * 0.4, small * 2, 5_000_000), 10_000);
        return { scheme: rng.pick(SCHEMES), friend: rng.pick(FRIENDS), small, big, ref: `${ctx.time}` };
      },
      title: (params) => `${text(params, 'friend')} wants you in ${text(params, 'scheme')}`,
      body: (params) =>
        `“Guy, ${text(params, 'scheme')} dey pay 100% in ${PONZI_PAYOUT_DAYS} days! I don withdraw twice. Na AI trading bot, e no fit fail.” ` +
        'The website has a countdown timer and a picture of a Lamborghini.',
      choices: [
        {
          id: 'invest-small',
          label: (params) => `Put in ${formatNaira(num(params, 'small'))}`,
          hint: () => '“100% in 30 days”',
          unavailable: affordable('small'),
          resolve: (ctx, params) => join(ctx, params, 'small'),
        },
        {
          id: 'invest-big',
          label: (params) => `Go big: ${formatNaira(num(params, 'big'))}`,
          hint: () => 'what could go wrong?',
          unavailable: affordable('big'),
          resolve: (ctx, params) => join(ctx, params, 'big'),
        },
        {
          id: 'decline',
          label: () => 'Na scam. Abeg comot.',
          resolve: async (ctx) => {
            addStatus(ctx, 2);
            return { title: 'Sense dey your head', body: 'You ignored the hype. Remember MMM and CBEX.', tone: 'good', moneyDelta: 0 };
          },
        },
      ],
      defaultChoiceId: 'decline',
    };
  }

  private bankGlitch(): LifeEventDefinition {
    return {
      id: 'investments-bank-glitch',
      domain: 'investments',
      art: '🏦',
      weight: 1,
      cooldownDays: 240,
      eligible: (ctx) => ctx.age >= 18,
      prepare: (ctx) => ({ bank: eventRng(ctx, 'bank-glitch').pick(BANKS), amount: GLITCH_AMOUNT, fine: EFCC_FINE, ref: `${ctx.time}` }),
      title: (params) => `${text(params, 'bank')} glitch: +${formatNaira(num(params, 'amount'))}`,
      body: (params) =>
        `Your ${text(params, 'bank')} app just showed ${formatNaira(num(params, 'amount'))} you don’t recognise. ` +
        'Twitter says the bank “glitched” for thousands of customers — some people are already buying iPhones.',
      choices: [
        {
          id: 'return-it',
          label: () => 'Report it and return the money',
          resolve: async (ctx) => {
            addStatus(ctx, 5);
            addMood(ctx, 'clean-conscience', 'Clean conscience', 6, 2);
            return { title: 'Integrity no get price', body: 'The bank thanked you. Your mum is proud.', tone: 'good', moneyDelta: 0 };
          },
        },
        {
          id: 'keep-it',
          label: () => 'Keep am. God did.',
          hint: () => 'EFCC dey watch',
          resolve: async (ctx, params) => this.keepGlitchMoney(ctx, params),
        },
      ],
      defaultChoiceId: 'return-it',
    };
  }

  private async keepGlitchMoney(ctx: SimulationContext, params: LifeEventParams): Promise<LifeEventOutcome> {
    const amount = num(params, 'amount');
    const fine = num(params, 'fine');
    const bank = text(params, 'bank');
    const ref = text(params, 'ref');
    await ctx.wallet.receive(amount, 'adjustment', `${bank} glitch credit`, `glitch:${ref}`, { income: 'unearned' });
    if (!ctx.rng('bank-glitch-efcc', ref).chance(EFCC_CATCH_CHANCE)) {
      return { title: 'Nobody came… yet', body: `The ${formatNaira(amount)} is still there. You check your DMs nervously.`, tone: 'neutral', moneyDelta: amount };
    }
    await ctx.wallet.pay(amount, 'adjustment', `${bank} reversed the glitch credit`, `glitch:${ref}:reversal`, { sink: 'burn' });
    ctx.character.unearnedTotal = Math.max(0, ctx.character.unearnedTotal - amount);
    const finePaid = await ctx.wallet.tryPay(fine, 'fine', 'EFCC fine: kept a bank glitch credit', `glitch:${ref}:fine`, { sink: 'burn' });
    addStatus(ctx, -20);
    addMood(ctx, 'efcc', 'EFCC wahala', -15, 3);
    return {
      title: 'EFCC came knocking',
      body: finePaid
        ? `${bank} reversed the money and EFCC fined you ${formatNaira(fine)}. Your face trended on Instablog.`
        : `${bank} reversed the money. You couldn’t pay the ${formatNaira(fine)} fine, so you spent the weekend in a cell.`,
      tone: 'bad',
      moneyDelta: finePaid ? -fine : 0,
    };
  }

  private cryptoBro(): LifeEventDefinition {
    return {
      id: 'investments-crypto-bro',
      domain: 'investments',
      art: '🚀',
      weight: 3,
      cooldownDays: 30,
      eligible: (ctx) => ctx.age >= 18 && ctx.wallet.cash >= 60_000,
      prepare: (ctx) => {
        const rng = eventRng(ctx, 'crypto-bro');
        return {
          friend: rng.pick(FRIENDS),
          coin: rng.chance(0.7) ? 'JOLLOF' : 'BTC',
          amount: roundTo(clamp(ctx.wallet.cash * 0.1, 20_000, 500_000), 5_000),
          ref: `${ctx.time}`,
        };
      },
      title: (params) => `${text(params, 'friend')} says ${text(params, 'coin') === 'JOLLOF' ? '$JOLLOF' : 'Bitcoin'} go 100x`,
      body: (params) =>
        text(params, 'coin') === 'JOLLOF'
          ? '“Bro, $JOLLOF is about to moon. The dev is doxxed (his avatar is a lion). Enter before the Binance listing!”'
          : '“Bitcoin halving season, bro. Everybody wey buy for 2017 don japa. Just put small.”',
      choices: [
        {
          id: 'buy',
          label: (params) => `Buy ${formatNaira(num(params, 'amount'))} of ${text(params, 'coin')}`,
          hint: () => '1% broker fee',
          unavailable: (ctx, params) => (ctx.wallet.cash < Math.ceil(num(params, 'amount') * 1.01) ? 'Not enough cash' : null),
          resolve: async (ctx, params) => {
            const coin = text(params, 'coin');
            const result = await this.trading.placeOrder(
              ctx,
              { instrumentId: coin, side: 'buy', size: { amountNaira: num(params, 'amount') } },
              `event:crypto-bro:${text(params, 'ref')}`,
            );
            return {
              title: `You now own ${result.trade.units} ${coin}`,
              body: 'You will now check the chart every five minutes. Welcome to crypto.',
              tone: 'neutral',
              moneyDelta: -(result.trade.gross + result.trade.fee),
            };
          },
        },
        {
          id: 'ask-proof',
          label: () => 'Ask for proof of his gains',
          resolve: async () => ({ title: 'He left you on read', body: 'His “gains” screenshots were from a demo account.', tone: 'good', moneyDelta: 0 }),
        },
        {
          id: 'ignore',
          label: () => 'Ignore',
          resolve: async () => ({ title: 'Not today', body: 'You muted the group chat.', tone: 'neutral', moneyDelta: 0 }),
        },
      ],
      defaultChoiceId: 'ignore',
    };
  }

  private tbillTip(): LifeEventDefinition {
    return {
      id: 'investments-tbill-auction',
      domain: 'investments',
      art: '📜',
      weight: 3,
      cooldownDays: 45,
      eligible: (ctx) => ctx.wallet.cash >= 250_000,
      prepare: (ctx) => ({
        rate: depositRate('tbill', 364, ctx.world.economy(ctx.time)),
        amount: roundTo(clamp(ctx.wallet.cash * 0.25, 100_000, 5_000_000), 10_000),
        ref: `${ctx.time}`,
      }),
      title: (params) => `T-bill auction: 364-day bills at ${formatPercent(num(params, 'rate'), 2)}`,
      body: (params) =>
        `Your banker calls: “CBN auction results are out — 364-day bills cleared at ${formatPercent(num(params, 'rate'), 2)}. ` +
        `Should I put ${formatNaira(num(params, 'amount'))} in for you? Interest is paid at maturity, minus 10% WHT.”`,
      choices: [
        {
          id: 'buy-tbill',
          label: (params) => `Invest ${formatNaira(num(params, 'amount'))} for 364 days`,
          hint: () => 'early exit costs 0.5% + interest',
          unavailable: (ctx, params) => (ctx.wallet.cash < num(params, 'amount') ? 'Not enough cash' : null),
          resolve: async (ctx, params) => {
            const amount = num(params, 'amount');
            const deposit = await this.deposits.open(ctx, { product: 'tbill', tenorDays: 364, amount }, `event:tbill:${text(params, 'ref')}`);
            return {
              title: 'T-bill booked',
              body: `Locked in at ${formatPercent(deposit.annualRate, 2)} until ${deposit.maturesAt ? formatDate(deposit.maturesAt) : 'maturity'}.`,
              tone: 'good',
              moneyDelta: -amount,
            };
          },
        },
        {
          id: 'not-now',
          label: () => 'Not now',
          resolve: async () => ({ title: 'Maybe next auction', body: 'Your banker sighs and hangs up.', tone: 'neutral', moneyDelta: 0 }),
        },
      ],
      defaultChoiceId: 'not-now',
    };
  }
}
