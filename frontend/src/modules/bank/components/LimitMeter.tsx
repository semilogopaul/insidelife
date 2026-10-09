import type { WalletDto } from '@insidelife/shared';
import { Money, ProgressBar } from '@/common/components';
import { nextTierHint, tierLabel, tierLimitLabel } from '../services/transfer-preview';

/**
 * What you can still send to players today (bank transfers and sprays count; charges don't), how much of your money
 * can be sent at all (starting money can't), and how to unlock the next tier.
 */
export function LimitMeter({
  wallet,
  showHint = true,
}: {
  readonly wallet: Pick<WalletDto, 'dailyLimit' | 'sentToday' | 'transferTier' | 'sendable' | 'receiveLimit'>;
  readonly showHint?: boolean;
}) {
  const limited = wallet.dailyLimit !== null;
  const remaining = wallet.dailyLimit === null ? null : Math.max(0, wallet.dailyLimit - wallet.sentToday);
  const hint = showHint ? nextTierHint(wallet.transferTier) : null;
  return (
    <div className="rounded-card bg-paper-2 p-3.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-bold">Left to send today</span>
        <span className="type-figure">{remaining === null ? 'No limit' : <Money amount={remaining} />}</span>
      </div>
      {limited && wallet.dailyLimit !== null && (
        <ProgressBar
          value={wallet.sentToday}
          max={wallet.dailyLimit}
          tone={remaining === 0 ? 'okada' : 'ink'}
          label={`Sending limit used today: ${Math.round((wallet.sentToday / Math.max(1, wallet.dailyLimit)) * 100)}%`}
          className="mt-2"
        />
      )}
      <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
        <span>Money you can send</span>
        <span className="type-figure">
          <Money amount={wallet.sendable} />
        </span>
      </div>
      <p className="mt-1.5 text-xs text-text-soft">
        {tierLabel(wallet.transferTier)}: {tierLimitLabel(wallet.dailyLimit)} to players (transfers and sprays). Your starting money is for spending, not
        sending. Anyone can receive up to <Money amount={wallet.receiveLimit} /> a day from players.{hint ? ` ${hint}` : ''}
      </p>
    </div>
  );
}
