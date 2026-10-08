import type { WalletDto } from '@insidelife/shared';
import { Money, ProgressBar } from '@/common/components';
import { nextTierHint, tierLabel } from '../services/transfer-preview';

/** Today's transfer allowance (charges count towards it), with how to unlock the next tier. */
export function LimitMeter({ wallet, showHint = true }: { readonly wallet: Pick<WalletDto, 'dailyLimit' | 'sentToday' | 'transferTier'>; readonly showHint?: boolean }) {
  const remaining = Math.max(0, wallet.dailyLimit - wallet.sentToday);
  const hint = showHint ? nextTierHint(wallet.transferTier) : null;
  return (
    <div className="rounded-card bg-paper-2 p-3.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-bold">Left to send today</span>
        <span className="type-figure">
          <Money amount={remaining} />
        </span>
      </div>
      <ProgressBar
        value={wallet.sentToday}
        max={wallet.dailyLimit}
        tone={remaining === 0 ? 'okada' : 'ink'}
        label={`Transfer limit used today: ${Math.round((wallet.sentToday / Math.max(1, wallet.dailyLimit)) * 100)}%`}
        className="mt-2"
      />
      <p className="mt-1.5 text-xs text-text-soft">
        {tierLabel(wallet.transferTier)} limit <Money amount={wallet.dailyLimit} /> a day, charges included.{hint ? ` ${hint}` : ''}
      </p>
    </div>
  );
}
