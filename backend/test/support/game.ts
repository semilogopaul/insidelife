import { economyAt, type GameMinute } from '@insidelife/shared';
import { CharacterSession } from '../../src/modules/simulation/character-session.service.js';
import type { IncomeClass } from '../../src/modules/simulation/simulation-context.js';
import type { E2eApp } from './app.js';
import { E2E_ENV } from './env.js';
import { key, type Player } from './players.js';

/**
 * What the game should charge for a catalog price at game time `t`: base × the world price index, rounded to ₦50
 * (under ₦10k), ₦100 (under ₦1m) or ₦10,000. Written out here independently of WorldService.price, as the oracle the
 * charges are checked against.
 */
export function worldPrice(base: number, t: GameMinute): number {
  if (base <= 0) return 0;
  const value = base * economyAt(E2E_ENV.WORLD_SEED ?? '', t).priceIndex;
  const step = value >= 1_000_000 ? 10_000 : value >= 10_000 ? 100 : 50;
  return Math.max(step, Math.round(value / step) * step);
}

/**
 * Test setup: put money in a character's wallet through the real wallet (one ledger posting from `system:mint`,
 * totals updated like any income). `earned` money can be sent to other players; starting money can't.
 */
export async function fund(e2e: E2eApp, player: Player, amount: number, income: IncomeClass = 'earned'): Promise<void> {
  await e2e.get(CharacterSession).run({ characterId: player.characterId }, async (ctx) => {
    await ctx.wallet.receive(amount, income === 'earned' ? 'salary' : 'adjustment', 'E2E setup funds', `e2e-fund:${key()}`, { income });
  });
}

/**
 * Test setup: spend all of a character's cash through the real wallet (one posting to `system:burn`), so a test that
 * depends on the exact balance starts from ₦0 whatever the birth lottery gave the character (a nepo baby starts with
 * ₦8m, a sapa pikin with ₦3m: enough to blow the $5,000 FX allowance in one test and not in another).
 */
export async function drainCash(e2e: E2eApp, player: Player): Promise<void> {
  await e2e.get(CharacterSession).run({ characterId: player.characterId }, async (ctx) => {
    await ctx.wallet.pay(ctx.wallet.cash, 'adjustment', 'E2E setup: start from ₦0', `e2e-drain:${key()}`);
  });
}

/** Poll until `check` returns a value (not undefined/false), or fail after `timeoutMs`. */
export async function waitFor<T>(check: () => Promise<T | undefined | false | null>, what: string, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== undefined && value !== false && value !== null) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

/** Fire `count` copies of a request at once and settle them all. */
export async function burst<T>(count: number, make: (index: number) => Promise<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: count }, (_, index) => make(index)));
}
