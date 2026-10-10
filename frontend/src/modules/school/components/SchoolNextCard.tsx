'use client';

import { useState } from 'react';
import { EXAM_DURATION_MINUTES, findInstitution, formatDate, formatGameDuration, type EducationOverviewDto, type GameMinute } from '@insidelife/shared';
import { Button, Money } from '@/common/components';
import { useEducationCommands } from '../hooks/use-education';
import { useExamCentre } from '../hooks/use-exam-centre';
import { useOpenSchoolSheet } from '../hooks/use-school-sheets';
import { useScoreReveal } from '../hooks/use-score-reveal';
import { announce, complain } from '@/common/game/feedback';
import { gameDateTime, relativeGameTime } from '@/common/utils/game-time';
import { jambReadiness, latestExam, schoolNextStep } from '../services/school-rules';
import { GoThere } from '@/common/components';
import { NextStep } from '@/common/components';
import { ScoreReveal } from './stages/ScoreReveal';
import { StudyButton } from './stages/StudyButton';

/** The top of School: a fresh JAMB result to open, or the one next step on the road ("Register for JAMB"). */
export function SchoolNextCard({
  overview,
  now,
}: {
  readonly overview: EducationOverviewDto;
  readonly now: GameMinute;
}) {
  const jamb = latestExam(overview.exams, 'jamb');
  const released = jamb !== null && jamb.status === 'released' && jamb.score !== null ? jamb : null;
  const { revealed } = useScoreReveal(released?.id ?? 'none');
  // Keep the reveal card on screen for the rest of this visit once it has started.
  const [revealing, setRevealing] = useState<string | null>(null);
  if (released && !revealed && revealing !== released.id) setRevealing(released.id);
  if (released && revealing === released.id) return <ScoreReveal key={released.id} exam={released} />;
  return <NextStepFor overview={overview} now={now} />;
}

function NextStepFor({
  overview,
  now,
}: {
  readonly overview: EducationOverviewDto;
  readonly now: GameMinute;
}) {
  const openSheet = useOpenSchoolSheet();
  const centre = useExamCentre();
  const { sitExam } = useEducationCommands();
  const step = schoolNextStep(overview, now);
  const jamb = latestExam(overview.exams, 'jamb');
  const atCbt = centre.here !== null && centre.open;
  const cbtActions = (onRegister: () => void, label: string) =>
    atCbt ? (
      <Button onClick={onRegister}>{label}</Button>
    ) : centre.here ? (
      <p className="text-sm font-bold text-danfo">
        {centre.here.name} opens at 7am. Wait small — or come back later.
      </p>
    ) : centre.nearest ? (
      <GoThere venueId={centre.nearest.id} venueName={centre.nearest.name} tone="ink" />
    ) : undefined;

  switch (step.kind) {
    case 'register-jamb':
      return (
        <NextStep
          title={step.lastScore === null ? 'Register for JAMB' : 'Rewrite JAMB'}
          body={
            <>
              {step.lastScore !== null && `Last score ${step.lastScore}. `}
              {centre.here
                ? `You’re at ${centre.here.name}. `
                : `Register in person at a CBT centre — ${centre.nearest?.name ?? 'Yaba or Ikeja'} is closest. `}
              Fee <Money amount={overview.prices.jamb} className="font-bold text-on-ink" />.
            </>
          }
          actions={cbtActions(() => openSheet({ kind: 'register', exam: 'jamb' }), 'Register now')}
        />
      );
    case 'resit-waec':
      return (
        <NextStep
          title="Fix your WAEC"
          body={
            <>
              Universities want five credits including Maths and English. Resit as a GCE candidate at a CBT
              centre for <Money amount={overview.prices.waecGce} className="font-bold text-on-ink" />
              {jamb === null && ' — you can register for JAMB on the same visit'}.
            </>
          }
          actions={
            <>
              {cbtActions(() => openSheet({ kind: 'register', exam: 'waec-gce' }), 'Register for GCE')}
              {atCbt && jamb === null && (
                <Button
                  variant="ghost"
                  className="ring-1 ring-white/25"
                  onClick={() => openSheet({ kind: 'register', exam: 'jamb' })}
                >
                  Register for JAMB
                </Button>
              )}
            </>
          }
        />
      );
    case 'await-gce':
      return (
        <NextStep
          kicker="Waiting"
          title="GCE in progress"
          body={
            step.exam.resultAt !== null
              ? `Result ${formatDate(step.exam.resultAt)}. Meanwhile, read for JAMB.`
              : `Write it at ${step.exam.venueName} from ${formatDate(step.exam.canSitFrom)}.`
          }
        />
      );
    case 'prepare-jamb':
      return (
        <NextStep
          title="Read for JAMB"
          body={`Prep ${Math.round(jambReadiness(step.exam.prepHours) * 100)}%. You can write from ${formatDate(step.exam.canSitFrom)} (${relativeGameTime(step.exam.canSitFrom, now)}) at ${step.exam.venueName}.`}
          actions={<StudyButton tone="ink" />}
        />
      );
    case 'sit-jamb': {
      const here = centre.here?.id === step.exam.venueId && centre.open;
      return (
        <NextStep
          title="Write JAMB"
          body={`${formatGameDuration(EXAM_DURATION_MINUTES)} at ${step.exam.venueName}. Papers start between 7am and 3pm. Prep ${Math.round(jambReadiness(step.exam.prepHours) * 100)}%.`}
          actions={
            here ? (
              <Button
                loading={sitExam.isPending}
                onClick={() =>
                  sitExam.mutate(step.exam.id, {
                    onSuccess: () => announce('Exam started', { body: `${formatGameDuration(EXAM_DURATION_MINUTES)} in the hall. You go pass!` }),
                    onError: (error) => complain('Couldn’t start the exam', error),
                  })
                }
              >
                Enter the exam hall
              </Button>
            ) : (
              <GoThere venueId={step.exam.venueId} venueName={step.exam.venueName} tone="ink" />
            )
          }
        />
      );
    }
    case 'writing-jamb':
      return (
        <NextStep
          kicker="Right now"
          title="Pen on paper"
          body="Writing JAMB. Close the phone and face your questions."
        />
      );
    case 'await-jamb':
      return (
        <NextStep
          kicker="Waiting"
          title="Results at midnight"
          body={
            step.exam.resultAt !== null
              ? `JAMB drops ${gameDateTime(step.exam.resultAt, now)} (${relativeGameTime(step.exam.resultAt, now)}). Pray small.`
              : 'Pray small.'
          }
        />
      );
    case 'apply-admission':
      return (
        <NextStep
          title="Apply for admission"
          body={`UTME ${step.score}. Pick schools whose cut-off you can beat — up to three at once.`}
          actions={<Button onClick={() => openSheet({ kind: 'apply' })}>Choose schools</Button>}
        />
      );
    case 'await-admission':
      return (
        <NextStep
          kicker="Waiting"
          title="Screening done"
          body={`${step.application.institutionName} decides ${gameDateTime(step.application.decisionAt, now)}. You can apply to others meanwhile.`}
          actions={
            <Button
              variant="ghost"
              className="ring-1 ring-white/25"
              onClick={() => openSheet({ kind: 'apply' })}
            >
              Apply elsewhere
            </Button>
          }
        />
      );
    case 'accept-offer':
      return (
        <NextStep
          kicker="Good news"
          title="You’ve been admitted!"
          body={`${step.application.courseName}, ${step.application.institutionName}.${step.application.acceptBy !== null ? ` Accept by ${formatDate(step.application.acceptBy)}.` : ''}`}
          actions={
            <Button onClick={() => openSheet({ kind: 'accept', applicationId: step.application.id })}>
              Accept offer
            </Button>
          }
        />
      );
    case 'pay-fees':
      return (
        <NextStep
          title="Pay school fees"
          body={
            <>
              <Money amount={step.enrolment.fees.due} className="font-bold text-on-ink" /> due for this
              session.
              {step.enrolment.fees.graceUntil !== null &&
                ` Suspension after ${formatDate(step.enrolment.fees.graceUntil)}.`}
            </>
          }
          actions={<Button onClick={() => openSheet({ kind: 'fees' })}>Pay fees</Button>}
        />
      );
    case 'strike':
      return (
        <NextStep
          kicker="Campus shut"
          title={step.strike.title}
          body={`${step.strike.description} Expected to end ${formatDate(step.strike.endsAt)}. Hustle or learn a skill meanwhile.`}
        />
      );
    case 'attend': {
      const institution = findInstitution(step.enrolment.institutionId);
      return (
        <NextStep
          title="Face your books"
          body={`${step.enrolment.level} ${step.enrolment.title}. Lectures weekdays 9am–3pm — your routine takes you. Extra reading lifts your GPA.`}
          actions={
            <>
              <StudyButton tone="ink" />
              {institution && !step.enrolment.livesInHostel && (
                <GoThere
                  venueId={institution.venueId}
                  venueName={institution.shortName}
                  tone="ink"
                  rideOption={false}
                />
              )}
            </>
          }
        />
      );
    }
    case 'register-nysc':
      return (
        <NextStep
          kicker="Graduate!"
          title="Register for NYSC"
          body="One year of service. Most graduate jobs want the certificate."
          actions={
            <Button
              onClick={() =>
                document.getElementById('school-stop-nysc')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              See NYSC
            </Button>
          }
        />
      );
    case 'serving':
      return (
        <NextStep
          kicker="Corper wee"
          title="Serving Nigeria"
          body={
            step.nysc.endsAt !== null
              ? `Passing out ${formatDate(step.nysc.endsAt)}. Jobs that need NYSC open up then.`
              : 'Show up at your PPA.'
          }
        />
      );
    case 'level-up':
      return (
        <NextStep
          kicker="Keep climbing"
          title="Get certified"
          body="Law School, ICAN, cloud certs, bootcamps and IELTS open doors (and pay)."
          actions={
            <Button
              onClick={() =>
                document.getElementById('school-programmes')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              See programmes
            </Button>
          }
        />
      );
  }
}
