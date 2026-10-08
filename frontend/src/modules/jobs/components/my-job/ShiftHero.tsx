'use client';

import type { EmploymentDto, GameMinute } from '@insidelife/shared';
import { formatDate } from '@insidelife/shared';
import { useCurrentPlace } from '@/common/hooks/use-current-place';
import { gameDateTime, relativeGameTime } from '@/common/utils/game-time';
import { nextShift } from '../../services/job-rules';
import { GoThere } from '@/common/components';
import { NextStep } from '@/common/components';

/** "Next shift: Tomorrow 08:00 at Marina" with directions — the one thing My job asks of you. */
export function ShiftHero({
  employment,
  now,
}: {
  readonly employment: EmploymentDto;
  readonly now: GameMinute;
}) {
  const place = useCurrentPlace();
  const { workplace, schedule, leave } = employment;

  if (leave.onLeave && leave.until !== null) {
    return (
      <NextStep
        kicker="On leave"
        title="Rest small"
        body={`Back to work ${formatDate(leave.until)} (${relativeGameTime(leave.until, now)}). Pay keeps coming.`}
      />
    );
  }
  if (employment.startedAt > now) {
    return (
      <NextStep
        kicker="New job"
        title={`Resume ${gameDateTime(employment.startedAt, now)}`}
        body={`${workplace.label} · ${schedule.label}`}
        actions={
          workplace.mode !== 'remote' ? (
            <GoThere venueId={workplace.venueId} venueName={workplace.name} tone="ink" />
          ) : undefined
        }
      />
    );
  }

  const shift = nextShift(schedule, now);
  const atWork = place.locationId === workplace.venueId;
  const title = shift?.inProgress
    ? 'You’re on shift'
    : shift
      ? `Work ${gameDateTime(shift.start, now)}`
      : 'No shifts scheduled';
  const where = workplace.mode === 'remote' ? 'From home — your laptop is your office' : workplace.label;
  const body = (
    <>
      {where} · {schedule.label}
      {shift && !shift.inProgress && (
        <span className="block">
          Starts {relativeGameTime(shift.start, now)}. Your routine takes you there if you’re free.
        </span>
      )}
      {shift?.inProgress && !atWork && workplace.mode !== 'remote' && (
        <span className="block">Ends {relativeGameTime(shift.end, now)}. Oga is counting who showed up.</span>
      )}
    </>
  );

  return (
    <NextStep
      kicker={shift?.inProgress ? 'Right now' : 'Next shift'}
      title={title}
      body={body}
      actions={
        workplace.mode === 'remote' ? undefined : atWork ? (
          <p className="text-sm font-bold text-danfo">You’re at {workplace.name}.</p>
        ) : (
          <GoThere venueId={workplace.venueId} venueName={workplace.name} tone="ink" />
        )
      }
    />
  );
}
