import { Injectable } from '@nestjs/common';
import { formatNaira, type TopupDetailsDto } from '@insidelife/shared';
import { LedgerService } from '../ledger/ledger.service.js';
import { CharacterSession } from '../simulation/character-session.service.js';

export interface Clawback {
  /** In-game naira taken back (cash first, then savings). */
  readonly taken: number;
  /** What couldn't be recovered because it was already spent. */
  readonly shortfall: number;
}

/**
 * Credits a paid top-up to a character's wallet inside their `CharacterSession` (row lock + settle). The ledger key
 * `<characterId>:topup:<reference>` is applied at most once, so replays credit nothing and announce nothing. When the
 * real payment is refunded afterwards, `clawBack` takes the coins back as far as the wallet allows.
 */
@Injectable()
export class TopupCreditor {
  constructor(
    private readonly session: CharacterSession,
    private readonly ledger: LedgerService,
  ) {}

  async credit(characterId: string, pack: TopupDetailsDto, reference: string): Promise<void> {
    await this.session.run({ characterId }, async (ctx) => {
      const before = ctx.wallet.cash;
      await ctx.wallet.receive(pack.virtualAmount, 'topup', `Top-up: ${pack.label}`, `topup:${reference}`, {
        income: 'purchased',
        metadata: { reference, packageId: pack.packageId ?? 'custom', ratePerNaira: pack.ratePerNaira },
      });
      if (ctx.wallet.cash <= before) return;
      ctx.notify({
        kind: 'money-received',
        title: 'Payment confirmed ✓',
        body: `${formatNaira(pack.virtualAmount)} (${pack.label}) don land for your wallet. Spend am well!`,
        tone: 'good',
        amount: pack.virtualAmount,
      });
    });
  }

  /**
   * Take back up to `amount` in-game naira after the real payment was refunded: cash first, then savings, never below
   * zero. Each refund of each source has its own ledger key (`topup-clawback[-savings]:<reference>:<refundId>`), so a
   * retry (or the same refund reported completed again) takes nothing twice, while a second partial refund takes its share.
   * The money returns to `system:topup` and comes off the character's purchased (and unearned) totals.
   */
  async clawBack(characterId: string, pack: TopupDetailsDto, amount: number, reference: string, refundId: string): Promise<Clawback> {
    return this.session.run({ characterId }, async (ctx) => {
      const balances = await this.ledger.balances(ctx.manager, characterId);
      const fromCash = Math.min(Math.max(0, ctx.wallet.cash), amount);
      const fromSavings = Math.min(Math.max(0, balances.savings), amount - fromCash);
      const memo = `Top-up refunded: ${pack.label} reversed`;
      const metadata = { reference, refundId, packageId: pack.packageId ?? 'custom', ratePerNaira: pack.ratePerNaira };
      const cashBefore = ctx.wallet.cash;
      await ctx.wallet.pay(fromCash, 'adjustment', memo, `topup-clawback:${reference}:${refundId}`, { sink: 'topup', metadata });
      const tookCash = cashBefore - ctx.wallet.cash;
      const savingsBefore = balances.savings;
      await ctx.wallet.pay(fromSavings, 'adjustment', memo, `topup-clawback-savings:${reference}:${refundId}`, { sink: 'topup', account: 'savings', metadata });
      const tookSavings = savingsBefore - (await this.ledger.balances(ctx.manager, characterId)).savings;
      const taken = tookCash + tookSavings;
      if (taken > 0) {
        const character = ctx.character;
        character.purchasedTotal = Math.max(0, Number(character.purchasedTotal) - taken);
        character.unearnedTotal = Math.max(0, Number(character.unearnedTotal) - taken);
        ctx.notify({
          kind: 'bill',
          title: 'Top-up reversed',
          body: `Your ${pack.label} payment was refunded, so ${formatNaira(taken)} was taken back from your wallet.`,
          tone: 'bad',
          amount: taken,
        });
      }
      return { taken, shortfall: Math.max(0, amount - taken) };
    });
  }
}
