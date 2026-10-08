import { Injectable } from '@nestjs/common';
import { formatNaira, type TopupPackage } from '@insidelife/shared';
import { CharacterSession } from '../simulation/character-session.service.js';

/**
 * Credits a paid top-up to a character's wallet inside their `CharacterSession` (row lock + settle). The ledger key
 * `<characterId>:topup:<reference>` is applied at most once, so replays credit nothing and announce nothing.
 */
@Injectable()
export class TopupCreditor {
  constructor(private readonly session: CharacterSession) {}

  async credit(characterId: string, pack: TopupPackage, reference: string): Promise<void> {
    await this.session.run({ characterId }, async (ctx) => {
      const before = ctx.wallet.cash;
      await ctx.wallet.receive(pack.virtualAmount, 'topup', `Top-up: ${pack.label}`, `topup:${reference}`, {
        income: 'purchased',
        metadata: { reference, packageId: pack.id },
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
}
