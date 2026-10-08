'use client';

import { NYSC_SERVICE_DAYS, formatDate, type GameMinute, type NyscServiceDto } from '@insidelife/shared';
import { Badge, Button, Money, ProgressBar } from '@/common/components';
import { useEducationCommands } from '../../hooks/use-education';
import { announce, complain } from '@/common/game/feedback';
import { relativeGameTime } from '@/common/utils/game-time';
import { GoThere } from '@/common/components';

/** National Youth Service: register after graduating, serve a year at your PPA, collect allowee. */
export function NyscStage({ nysc, now }: { readonly nysc: NyscServiceDto; readonly now: GameMinute }) {
  const { registerNysc } = useEducationCommands();

  if (nysc.status === 'not-eligible')
    return (
      <p className="text-sm text-text-soft">
        For university and HND graduates. Most graduate jobs ask for it.
      </p>
    );
  if (nysc.status === 'exempt')
    return <Badge tone="good">Exempted — your exemption letter works for jobs</Badge>;
  if (nysc.status === 'completed') return <Badge tone="good">Passed out. Certificate in your file.</Badge>;
  if (nysc.status === 'pending') {
    return (
      <div className="flex flex-col gap-2.5">
        <p className="text-sm text-text-soft">
          One year of service with <Money amount={nysc.monthlyAllowance} className="font-bold text-text" /> a
          month allowance, plus whatever your PPA pays.
        </p>
        <Button
          className="self-start"
          loading={registerNysc.isPending}
          onClick={() =>
            registerNysc.mutate(undefined, {
              onSuccess: () =>
                announce('Corper wee!', {
                  body: 'You’ve been mobilised. Check your call-up details here.',
                  sfx: 'celebration',
                  serverNotifies: true,
                }),
              onError: (error) => complain('Couldn’t register for NYSC', error),
            })
          }
        >
          Register for NYSC
        </Button>
      </div>
    );
  }

  const progress =
    nysc.startsAt !== null && nysc.endsAt !== null
      ? ((now - nysc.startsAt) / Math.max(1, nysc.endsAt - nysc.startsAt)) * 100
      : 0;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="rounded-card bg-paper-2 p-3.5">
        <p className="font-bold">{nysc.stateCode ?? 'Corps member'}</p>
        <p className="text-text-soft">
          PPA: {nysc.ppaName ?? 'awaiting posting'} ·{' '}
          <Money amount={nysc.monthlyAllowance + nysc.ppaStipend} /> a month
        </p>
        <ProgressBar className="mt-2.5" value={progress} label="Service year" tone="naira" />
        {nysc.endsAt !== null && (
          <p className="mt-1 text-xs text-text-soft">
            Passing out {formatDate(nysc.endsAt)} ({relativeGameTime(nysc.endsAt, now)}) · {NYSC_SERVICE_DAYS}{' '}
            days in all
          </p>
        )}
      </div>
      {nysc.ppaVenueId && nysc.ppaName && (
        <GoThere venueId={nysc.ppaVenueId} venueName={nysc.ppaName} rideOption={false} />
      )}
    </div>
  );
}
