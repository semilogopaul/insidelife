'use client';

import { formatNaira, type PlayerProfileDto, type WalletDto } from '@insidelife/shared';
import { Button, Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { pressKey } from '@/common/utils/money-input';
import { maxSendable, previewTransfer } from '../../services/transfer-preview';
import { AmountField } from '../AmountField';
import { Keypad } from './Keypad';
import { Monogram } from './RecipientCard';

const QUICK_AMOUNTS = [
  { value: 1_000, label: '₦1k' },
  { value: 5_000, label: '₦5k' },
  { value: 10_000, label: '₦10k' },
  { value: 20_000, label: '₦20k' },
] as const;

export interface AmountStepProps {
  readonly recipient: PlayerProfileDto;
  readonly wallet: WalletDto;
  readonly amount: number | null;
  readonly onAmount: (amount: number | null) => void;
  readonly onChangeRecipient: () => void;
  readonly onContinue: () => void;
  readonly onTopUp: () => void;
}

/** Amount with live fee, stamp duty and daily-limit preview; the problem (if any) is said in plain words. */
export function AmountStep({ recipient, wallet, amount, onAmount, onChangeRecipient, onContinue, onTopUp }: AmountStepProps) {
  const limits = { cash: wallet.balance, dailyLimit: wallet.dailyLimit, sentToday: wallet.sentToday };
  const preview = previewTransfer(amount, limits);
  const max = maxSendable(limits);
  const problem = preview.problem;
  const hint =
    problem && problem.code !== 'EMPTY'
      ? problem.message
      : max > 0
        ? `You can send up to ${formatNaira(max)} right now.`
        : 'Nothing left to send today: no cash or no limit left.';

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onChangeRecipient} className="flex items-center gap-2.5 self-start rounded-full bg-paper-2 py-1 pl-1 pr-3 text-left hover:bg-paper-3">
        <Monogram person={recipient} size="sm" />
        <span className="text-sm">
          To <strong>{recipient.firstName}</strong> <span className="text-text-soft">@{recipient.handle}</span>
        </span>
        <span className="sr-only">(change recipient)</span>
      </button>

      <AmountField label="Amount" value={amount} onChange={onAmount} hint={hint} invalid={problem !== null && problem.code !== 'EMPTY'} keypad />

      <div className="flex flex-wrap justify-center gap-1.5">
        {QUICK_AMOUNTS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onAmount(value)}
            aria-pressed={amount === value}
            className={cn('h-8 rounded-full px-3 text-sm font-bold ring-1', amount === value ? 'bg-ink text-on-ink ring-ink' : 'bg-paper ring-line hover:bg-paper-2')}
          >
            {label}
          </button>
        ))}
        {max > 0 && (
          <button type="button" onClick={() => onAmount(max)} className="h-8 rounded-full bg-paper px-3 text-sm font-bold ring-1 ring-line hover:bg-paper-2">
            Max
          </button>
        )}
      </div>

      <ChargesLine fee={preview.fee} stampDuty={preview.stampDuty} totalDebit={preview.totalDebit} remainingAfter={preview.remainingAfter} visible={preview.amount > 0} />

      <Keypad label="Amount keypad" onPress={(key) => onAmount(pressKey(amount, key))} />

      <div className="sticky bottom-0 -mx-1 flex flex-col gap-2 bg-paper px-1 pb-1 pt-2">
        {problem?.code === 'INSUFFICIENT' ? (
          <Button size="lg" variant="ink" block onClick={onTopUp}>
            Top up your wallet
          </Button>
        ) : (
          <Button size="lg" block disabled={problem !== null} onClick={onContinue}>
            {preview.amount > 0 && problem === null ? `Review ${formatNaira(preview.amount)}` : 'Enter an amount'}
          </Button>
        )}
      </div>
    </div>
  );
}

/** One compact line under the amount: charges, what leaves your cash, limit left. Full breakdown is on the next step. */
function ChargesLine({ fee, stampDuty, totalDebit, remainingAfter, visible }: { readonly fee: number; readonly stampDuty: number; readonly totalDebit: number; readonly remainingAfter: number; readonly visible: boolean }) {
  return (
    <dl className={cn('grid grid-cols-3 divide-x divide-line rounded-card bg-paper-2 py-2.5 text-center text-xs', !visible && 'opacity-50')} aria-live="polite">
      <div className="px-2">
        <dt className="text-text-soft">Charges</dt>
        <dd className="tabular mt-0.5 text-sm font-bold">{fee + stampDuty === 0 ? 'Free' : <Money amount={fee + stampDuty} />}</dd>
      </div>
      <div className="px-2">
        <dt className="text-text-soft">Total debit</dt>
        <dd className="tabular mt-0.5 text-sm font-bold">
          <Money amount={totalDebit} />
        </dd>
      </div>
      <div className="px-2">
        <dt className="text-text-soft">Limit left after</dt>
        <dd className="tabular mt-0.5 text-sm font-bold">
          <Money amount={remainingAfter} />
        </dd>
      </div>
    </dl>
  );
}
