import { rngFor, type Needs } from '@insidelife/shared';
import type { MoodModifier } from '../characters/entities/character.entity.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SOCIAL_LIFE_EVENTS } from './social.events.js';

interface Payment {
  readonly amount: number;
  readonly kind: string;
  readonly key: string;
  readonly income?: string;
}

/** Just enough of a SimulationContext for life-event cards. */
function fakeContext(cash: number, friends: readonly string[] = []) {
  const paid: Payment[] = [];
  const received: Payment[] = [];
  const character = {
    id: 'c1',
    seed: 'seed-1',
    status: 120,
    connections: 10,
    needs: { energy: 50, hunger: 50, hygiene: 50, fun: 50, social: 50 } as Needs,
    moodModifiers: [] as MoodModifier[],
  };
  const ctx = {
    character,
    time: 1_000_000,
    age: 25,
    rng: (...parts: ReadonlyArray<string | number>) => rngFor(character.seed, ...parts),
    world: { price: (base: number) => base },
    manager: { query: async () => friends.map((handle) => ({ handle })) },
    wallet: {
      canAfford: (amount: number) => cash >= amount,
      pay: async (amount: number, kind: string, _memo: string, key: string) => {
        cash -= amount;
        paid.push({ amount, kind, key });
      },
      receive: async (amount: number, kind: string, _memo: string, key: string, options: { income: string }) => {
        cash += amount;
        received.push({ amount, kind, key, income: options.income });
      },
    },
  };
  return { ctx: ctx as unknown as SimulationContext, character, paid, received };
}

describe('social life events', () => {
  it('registers the six social cards with valid default choices', () => {
    expect(SOCIAL_LIFE_EVENTS.map((event) => event.id)).toEqual([
      'social-friend-birthday',
      'social-viral-post',
      'social-group-chat-drama',
      'social-owambe-invite',
      'social-old-tweet',
      'social-catfish-dm',
    ]);
    for (const event of SOCIAL_LIFE_EVENTS) expect(event.choices.some((choice) => choice.id === event.defaultChoiceId)).toBe(true);
  });

  it('every choice resolves with sensible, bounded effects', async () => {
    for (const event of SOCIAL_LIFE_EVENTS) {
      for (const choice of event.choices) {
        const { ctx, character } = fakeContext(10_000_000, ['tolu']);
        const params = (await event.prepare?.(ctx)) ?? {};
        expect(event.title(params).length).toBeGreaterThan(0);
        expect(event.body(params).length).toBeGreaterThan(0);
        expect(choice.label(params).length).toBeGreaterThan(0);
        const outcome = await choice.resolve(ctx, params);
        expect(outcome.title.length).toBeGreaterThan(0);
        expect(character.status).toBeGreaterThanOrEqual(0);
        for (const value of Object.values(character.needs)) expect(value).toBeGreaterThanOrEqual(0);
        for (const value of Object.values(character.needs)) expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it('uses a real friend’s handle when you have friends, an NPC otherwise', async () => {
    const birthday = SOCIAL_LIFE_EVENTS.find((event) => event.id === 'social-friend-birthday')!;
    expect((await birthday.prepare!(fakeContext(0, ['tolu']).ctx)).friend).toBe('@tolu');
    expect(String((await birthday.prepare!(fakeContext(0).ctx)).friend)).not.toMatch(/^@/);
  });

  it('charges aso-ebi through the wallet with a deterministic key, and disables it when broke', async () => {
    const invite = SOCIAL_LIFE_EVENTS.find((event) => event.id === 'social-owambe-invite')!;
    const buy = invite.choices.find((choice) => choice.id === 'buy-aso-ebi')!;
    const rich = fakeContext(1_000_000);
    const params = await invite.prepare!(rich.ctx);
    const outcome = await buy.resolve(rich.ctx, params);
    expect(rich.paid).toEqual([{ amount: params.asoEbi, kind: 'ceremony', key: `aso-ebi:${rich.ctx.time}` }]);
    expect(outcome.moneyDelta).toBe(-Number(params.asoEbi));
    expect(await buy.unavailable!(fakeContext(1_000).ctx, params)).toMatch(/money/);
  });

  it('pays viral brand deals as earned income only with enough clout', async () => {
    const viral = SOCIAL_LIFE_EVENTS.find((event) => event.id === 'social-viral-post')!;
    const milk = viral.choices.find((choice) => choice.id === 'milk-it')!;
    const famous = fakeContext(0);
    await milk.resolve(famous.ctx, await viral.prepare!(famous.ctx));
    expect(famous.received).toHaveLength(1);
    expect(famous.received[0]?.income).toBe('earned');

    const unknown = fakeContext(0);
    unknown.character.status = 10;
    await milk.resolve(unknown.ctx, await viral.prepare!(unknown.ctx));
    expect(unknown.received).toHaveLength(0);
  });

  it('rolls the same card parameters for the same day (no re-rolling fate)', async () => {
    const drama = SOCIAL_LIFE_EVENTS.find((event) => event.id === 'social-group-chat-drama')!;
    expect(await drama.prepare!(fakeContext(0).ctx)).toEqual(await drama.prepare!(fakeContext(0).ctx));
  });
});
