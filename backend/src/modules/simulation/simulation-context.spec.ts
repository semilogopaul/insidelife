import type { EntityManager } from 'typeorm';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import type { LedgerService } from '../ledger/ledger.service.js';
import type { PostingResult } from '../ledger/interfaces/ledger.interfaces.js';
import type { WorldService } from '../world/world.service.js';
import { CharacterWallet, SimulationContext } from './simulation-context.js';

const ACCOUNTS = { cash: 'cash-1', savings: 'savings-1', pension: 'pension-1', usd: 'usd-1' } as const;

/** A wallet whose ledger has already seen some keys (a repeat inside the same game minute). */
function walletWith(usedKeys: readonly string[]): { wallet: CharacterWallet; debited: string[] } {
  const character = { id: 'char-1', settledAt: 1_000, seed: 'seed' } as CharacterEntity;
  const ctx = new SimulationContext(character, {} as EntityManager, {} as WorldService, 1_000);
  const debited: string[] = [];
  const ledger = {
    debit: async (_manager: EntityManager, input: { idempotencyKey: string; amount: number }): Promise<PostingResult> => {
      const applied = !usedKeys.includes(input.idempotencyKey);
      if (applied) debited.push(input.idempotencyKey);
      return { transactionId: 't', applied, balances: applied ? new Map([[ACCOUNTS.cash, 900]]) : new Map() };
    },
  } as unknown as LedgerService;
  const wallet = new CharacterWallet(ctx, ledger, ACCOUNTS, 1_000);
  ctx.bindWallet(wallet);
  return { wallet, debited };
}

describe('CharacterWallet.pay with refuseRepeat', () => {
  it('charges normally the first time', async () => {
    const { wallet, debited } = walletWith([]);
    await wallet.pay(100, 'property', 'Land', 'land:epe:c-of-o:1000', { refuseRepeat: 'Too soon' });
    expect(debited).toEqual(['char-1:land:epe:c-of-o:1000']);
    expect(wallet.cash).toBe(900);
  });

  it('refuses a repeated key instead of letting the caller deliver for free', async () => {
    const { wallet } = walletWith(['char-1:land:epe:c-of-o:1000']);
    await expect(wallet.pay(100, 'property', 'Land', 'land:epe:c-of-o:1000', { refuseRepeat: 'You just bought land there' })).rejects.toThrow(GameRuleException);
    await expect(wallet.pay(100, 'property', 'Land', 'land:epe:c-of-o:1000', { refuseRepeat: 'You just bought land there' })).rejects.toMatchObject({
      errorCode: 'TOO_SOON',
      message: 'You just bought land there',
    });
    expect(wallet.cash).toBe(1_000);
  });

  it('keeps the old behaviour (a silent no-op) without it, for replays that must be harmless', async () => {
    const { wallet } = walletWith(['char-1:salary:12']);
    await expect(wallet.pay(100, 'purchase', 'Replay', 'salary:12')).resolves.toBeUndefined();
    expect(wallet.cash).toBe(1_000);
  });
});
