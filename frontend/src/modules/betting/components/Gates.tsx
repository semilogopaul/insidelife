'use client';

import { CalendarCheck, Lock } from 'lucide-react';
import { useState } from 'react';
import { BETTING_RULES, formatNaira, type BettingAccountDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Sheet } from '@/common/components';
import { useUi } from '@/common/game/ui-store';
import { useBettingSettings } from '../hooks/use-betting';

/** For accounts made before sign-up asked: confirm your real date of birth once (betting is 18+ by real age). */
export function ConfirmBirthDate({ message }: { readonly message: string | null }) {
  const [value, setValue] = useState('');
  const [sure, setSure] = useState(false);
  const { confirmBirthDate } = useBettingSettings();
  return (
    <form
      className="flex flex-col gap-3 rounded-card bg-paper-2 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (value && sure) confirmBirthDate.mutate(value);
      }}
    >
      <CalendarCheck size={28} aria-hidden className="text-pitch" />
      <h3 className="type-title text-xl">Confirm your date of birth</h3>
      <p className="text-sm text-text-soft">{message ?? `Betting is for players aged ${BETTING_RULES.minAge} and over.`} It goes on your account once and can’t be changed afterwards.</p>
      <label htmlFor="bet-dob" className="text-sm font-bold">
        Your real date of birth
      </label>
      <input
        id="bet-dob"
        type="date"
        required
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-12 rounded-card bg-paper px-3 font-bold ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-ink"
      />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={sure} onChange={(event) => setSure(event.target.checked)} className="mt-0.5 size-4" />
        This is my real date of birth.
      </label>
      {confirmBirthDate.error && (
        <p role="alert" className="text-sm font-bold text-okada">
          {errorMessage(confirmBirthDate.error)}
        </p>
      )}
      <Button type="submit" disabled={!value || !sure} loading={confirmBirthDate.isPending}>
        Confirm
      </Button>
    </form>
  );
}

/** The board is closed to you (under 18, a break, a young character): say why, plainly. */
export function Blocked({ account }: { readonly account: BettingAccountDto }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card bg-paper-2 px-4 py-8 text-center">
      <Lock size={28} aria-hidden className="text-text-soft" />
      <p className="type-title text-xl">{account.block === 'self-excluded' ? 'You’re on a break' : 'Not for you yet'}</p>
      <p className="max-w-xs text-sm text-text-soft">{account.blockMessage}</p>
      {account.excludedUntil && <p className="text-sm font-bold">Ends {new Date(account.excludedUntil).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
    </div>
  );
}

/** Every few minutes in the app: how long you've been here and what today has cost, with a way out. */
export function RealityCheckSheet({ open, minutes, account, onContinue }: { readonly open: boolean; readonly minutes: number; readonly account: BettingAccountDto; readonly onContinue: () => void }) {
  const closePhone = useUi((state) => state.closePhone);
  const net = account.today.won - account.today.staked;
  return (
    <Sheet open={open} onClose={onContinue} title="Reality check" size="sm" description={`You’ve been betting for ${minutes} minute${minutes === 1 ? '' : 's'}.`}>
      <div className="flex flex-col gap-4 pb-1">
        <p className="text-sm">
          Today you’ve staked <b>{formatNaira(account.today.staked)}</b> and won <b>{formatNaira(account.today.won)}</b>:{' '}
          <b className={net < 0 ? 'text-okada' : 'text-naira'}>
            {net < 0 ? 'down' : 'up'} {formatNaira(Math.abs(net))}
          </b>
          .
        </p>
        <p className="text-xs text-text-soft">Game naira only, no cash value. The house keeps about 7% of everything staked over time.</p>
        <div className="flex flex-col gap-2">
          <Button block onClick={onContinue}>
            Keep playing
          </Button>
          <Button
            variant="paper"
            block
            onClick={() => {
              onContinue();
              closePhone();
            }}
          >
            Take a break
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
