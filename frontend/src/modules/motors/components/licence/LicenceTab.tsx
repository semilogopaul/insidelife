'use client';

import { BadgeCheck, CarFront } from 'lucide-react';
import {
  DRIVERS_LICENCE,
  findVenue,
  formatGameDuration,
  type GameMinute,
  type VehiclesDto,
} from '@insidelife/shared';
import { Button, Money } from '@/common/components';
import { useSnapshot } from '@/common/game/snapshot';
import { useCurrentPlace } from '@/common/hooks/use-current-place';
import { useVehicleCommands } from '../../hooks/use-vehicles';
import { announce, complain } from '@/common/game/feedback';
import { gameDateTime, relativeGameTime } from '@/common/utils/game-time';
import { GoThere } from '@/common/components';
import { NextStep } from '@/common/components';

const MIN_AGE = 18;

/** FRSC driver's licence: held, in progress, or how to get one (age 18+, the fee, a 1-hour test at a government office). */
export function LicenceTab({ data, now }: { readonly data: VehiclesDto; readonly now: GameMinute }) {
  const { applyForLicence } = useVehicleCommands();
  const { data: snapshot } = useSnapshot();
  const place = useCurrentPlace();
  const { licence } = data;
  const age = snapshot?.character.age ?? 0;
  const centres = licence.testCentres.map((id) => findVenue(id)).filter((venue) => venue !== undefined);
  const atCentre = place.venue !== null && licence.testCentres.includes(place.venue.id);
  const centre = centres[0];

  if (licence.held) {
    return (
      <div className="flex flex-col gap-3">
        <div className="relative overflow-hidden rounded-card bg-[linear-gradient(135deg,#e7f3ea,#d9ecf3)] p-4 ring-1 ring-line">
          <p className="text-xs font-bold text-naira">Federal Road Safety Corps</p>
          <p className="type-title mt-1 text-2xl">National driver’s licence</p>
          <p className="mt-2 flex items-center gap-1.5 text-sm font-bold">
            <BadgeCheck size={18} aria-hidden className="text-naira" />
            {snapshot ? `${snapshot.character.firstName} ${snapshot.character.lastName}` : 'Valid'} · Class B
          </p>
        </div>
        <p className="text-sm text-text-soft">
          Checkpoints can’t touch you for this one. Drive carefully — Lagos roads no get joke.
        </p>
      </div>
    );
  }

  if (licence.testInProgress) {
    return (
      <NextStep
        kicker="Right now"
        title="Driving test on"
        body={`The FRSC officer is watching your every move. Result ${licence.testEndsAt !== null ? `${gameDateTime(licence.testEndsAt, now)} (${relativeGameTime(licence.testEndsAt, now)})` : 'soon'}.`}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <NextStep
        title={age < MIN_AGE ? `Wait till 18` : atCentre ? 'Take the driving test' : 'Get your licence'}
        body={
          age < MIN_AGE ? (
            'FRSC only licenses drivers from 18. You can still drive — at your own risk at police checkpoints.'
          ) : (
            <>
              <Money amount={licence.fee} className="font-bold text-on-ink" /> FRSC fee and a{' '}
              {formatGameDuration(DRIVERS_LICENCE.testMinutes)} test at{' '}
              {centres.map((venue) => venue.name).join(' or ')}.
            </>
          )
        }
        actions={
          age < MIN_AGE ? undefined : atCentre ? (
            <Button
              icon={<CarFront size={18} aria-hidden />}
              loading={applyForLicence.isPending}
              onClick={() =>
                applyForLicence.mutate(undefined, {
                  onSuccess: (result) =>
                    announce('Test started', {
                      body: `Mirror, signal, manoeuvre. ${formatGameDuration(DRIVERS_LICENCE.testMinutes)} with the examiner.`,
                      amount: -result.fee,
                    }),
                  onError: (error) => complain('No test today', error),
                })
              }
            >
              Pay and start the test
            </Button>
          ) : centre ? (
            <GoThere venueId={centre.id} venueName={centre.name} tone="ink" />
          ) : undefined
        }
      />
      <ul className="flex flex-col gap-2 text-sm">
        <li className="flex items-center justify-between gap-3 rounded-card bg-paper-2 p-3">
          <span>Age 18 or older</span>
          <strong className={age >= MIN_AGE ? 'text-naira' : 'text-okada'}>
            {age >= MIN_AGE ? 'Yes' : `You’re ${age}`}
          </strong>
        </li>
        <li className="flex items-center justify-between gap-3 rounded-card bg-paper-2 p-3">
          <span>FRSC fee</span>
          <Money amount={licence.fee} className="font-bold" />
        </li>
        <li className="flex items-center justify-between gap-3 rounded-card bg-paper-2 p-3">
          <span>Where</span>
          <strong className="text-right">{centres.map((venue) => venue.name).join(', ')}</strong>
        </li>
      </ul>
      <p className="text-xs text-text-soft">
        Bolt driving and some jobs need a licence. Driving without one means wahala at checkpoints.
      </p>
    </div>
  );
}
