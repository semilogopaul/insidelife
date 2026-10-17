'use client';

import { findVenue, type GameMinute, type HangarDto } from '@insidelife/shared';
import { Badge, Button, GoThere, Money, NextStep, ProgressBar } from '@/common/components';
import { announce, complain } from '@/common/game/feedback';
import { useHangarCommands } from '../../hooks/use-hangar';
import { lessonProgress, nextTrainingStep } from '../../services/hangar-rules';

/** Private Pilot Licence: enrol at the GAT flight school, a lesson a day, then the check-ride. */
export function LicenceTab({ data, now }: { readonly data: HangarDto; readonly now: GameMinute }) {
  const { training } = data;
  const { enrol, lesson, checkRide } = useHangarCommands();
  const step = nextTrainingStep(training, now);
  const school = findVenue(training.schoolVenueId);
  const there = training.atSchool;

  const run = (label: string, mutation: typeof enrol | typeof lesson | typeof checkRide, title: string): void => {
    mutation.mutate(undefined, {
      onSuccess: (result) => announce(title, { amount: -result.fee, sfx: 'ui-success' }),
      onError: (error) => complain(label, error),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {step === 'licensed' ? (
        <NextStep kicker="Licence" title="You’re a pilot" body="Your Private Pilot Licence lets you fly piston planes and turboprops yourself. Jets come with a hired crew." />
      ) : (
        <NextStep
          kicker="Private Pilot Licence"
          title={
            step === 'enrol'
              ? 'Enrol at flight school'
              : step === 'check-ride'
                ? 'Ready for the check-ride'
                : step === 'wait'
                  ? 'Lesson done for today'
                  : step === 'busy'
                    ? training.inProgress === 'check-ride'
                      ? 'In the check-ride'
                      : 'In a lesson'
                    : 'Book a lesson'
          }
          body={
            step === 'wait'
              ? 'One lesson a day. Come back tomorrow.'
              : `Needed to fly piston planes and turboprops yourself. ${training.lessonsRequired} lessons, then a check-ride, at the Lagos General Aviation Terminal.`
          }
          actions={
            step === 'enrol' ? (
              <Button disabled={!there} loading={enrol.isPending} onClick={() => run('Couldn’t enrol', enrol, 'Enrolled 🛩️')}>
                Enrol · <Money amount={training.enrolFee} compact />
              </Button>
            ) : step === 'lesson' ? (
              <Button disabled={!there} loading={lesson.isPending} onClick={() => run('Couldn’t book a lesson', lesson, 'Lesson booked')}>
                Book a lesson · <Money amount={training.lessonFee} compact />
              </Button>
            ) : step === 'check-ride' ? (
              <Button disabled={!there} loading={checkRide.isPending} onClick={() => run('Couldn’t book the check-ride', checkRide, 'Check-ride booked')}>
                Take the check-ride · <Money amount={training.checkRideFee} compact />
              </Button>
            ) : undefined
          }
        />
      )}

      {step !== 'licensed' && (
        <section aria-label="Progress" className="flex flex-col gap-2 rounded-card bg-paper-2 p-3.5">
          <div className="flex items-baseline justify-between">
            <h3 className="type-title text-lg">Logbook</h3>
            <span className="text-sm font-bold">
              {training.lessons} of {training.lessonsRequired} lessons
            </span>
          </div>
          <ProgressBar value={lessonProgress(training) * 100} label="Flight lessons completed" tone="naira" />
          {training.checkRideAttempts > 0 && (
            <p className="text-xs text-text-soft">Check-rides flown: {training.checkRideAttempts}. A failed one costs the fee and two lessons of rust.</p>
          )}
        </section>
      )}

      {step !== 'licensed' && !there && (
        <div className="flex flex-col gap-2 rounded-card bg-paper-2 p-3.5 text-sm">
          <p>
            <Badge tone="warn">Not at school</Badge> The flight school is at the Lagos General Aviation Terminal.
          </p>
          {school ? <GoThere venueId={school.id} venueName={school.name} /> : <p className="text-text-soft">Head to the terminal at Murtala Muhammed Airport.</p>}
        </div>
      )}

      <section aria-label="Costs" className="rounded-card bg-paper-2 p-3.5 text-sm">
        <h3 className="type-title mb-2 text-lg">What it costs</h3>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          <dt className="text-text-soft">Enrolment</dt>
          <dd className="text-right font-bold"><Money amount={training.enrolFee} compact /></dd>
          <dt className="text-text-soft">Each lesson</dt>
          <dd className="text-right font-bold"><Money amount={training.lessonFee} compact /></dd>
          <dt className="text-text-soft">Check-ride</dt>
          <dd className="text-right font-bold"><Money amount={training.checkRideFee} compact /></dd>
        </dl>
        <p className="mt-2 text-xs text-text-soft">You must be {training.minAge} or older. Studying and aircraft ownership both add to your clout.</p>
      </section>
    </div>
  );
}
