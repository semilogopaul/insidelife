'use client';

import { PenLine } from 'lucide-react';
import {
  ACTION_PACE,
  EXAM_DURATION_MINUTES,
  JAMB_MAX_SCORE,
  JAMB_MIN_POLYTECHNIC,
  JAMB_MIN_UNIVERSITY,
  formatDate,
  formatGameDuration,
  type EducationOverviewDto,
  type GameMinute,
} from '@insidelife/shared';
import { Badge, Button, Money, ProgressBar } from '@/common/components';
import { useEducationCommands } from '../../hooks/use-education';
import { useOpenSchoolSheet } from '../../hooks/use-school-sheets';
import { useScoreReveal } from '../../hooks/use-score-reveal';
import { announce, complain } from '@/common/game/feedback';
import { gameDateTime, relativeGameTime } from '@/common/utils/game-time';
import { jambReadiness, jambVerdict, latestExam } from '../../services/school-rules';
import { ExamCentreGate } from './ExamCentreGate';
import { StudyButton } from './StudyButton';

/** JAMB: register at a CBT centre → read → write (1½ hours) → result at midnight. */
export function JambStage({
  overview,
  now,
}: {
  readonly overview: EducationOverviewDto;
  readonly now: GameMinute;
}) {
  const openSheet = useOpenSchoolSheet();
  const { sitExam } = useEducationCommands();
  const exam = latestExam(overview.exams, 'jamb');

  if (exam && exam.status !== 'released') {
    const readiness = jambReadiness(exam.prepHours);
    // Prep counts effective hours (an hour at the books counts ACTION_PACE times); players see the hours they studied.
    const studiedHours = Math.round((exam.prepHours / ACTION_PACE) * 10) / 10;
    const canSit = now >= exam.canSitFrom;
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-card bg-paper-2 p-3.5 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold">Registered at {exam.venueName}</p>
            <Badge tone="info">
              {exam.status === 'registered'
                ? 'Preparing'
                : exam.status === 'sitting'
                  ? 'Writing now'
                  : 'Marking'}
            </Badge>
          </div>
          {exam.firstChoice && (
            <p className="mt-0.5 text-text-soft">
              First choice: {exam.firstChoice.courseName}, {exam.firstChoice.institutionName}
            </p>
          )}
          {exam.status === 'registered' && (
            <>
              <div className="mt-3 flex items-baseline justify-between text-sm">
                <span className="font-bold">Preparation</span>
                <span className="tabular font-bold">{Math.round(readiness * 100)}%</span>
              </div>
              <ProgressBar
                className="mt-1.5"
                value={readiness * 100}
                label="JAMB preparation"
                tone={readiness >= 0.6 ? 'naira' : 'danfo'}
              />
              <p className="mt-1.5 text-xs text-text-soft">
                {studiedHours}h of study since you registered. Around 10–20 hours of
                study makes a real difference.
              </p>
            </>
          )}
          {exam.status === 'written' && exam.resultAt !== null && (
            <p className="mt-2 text-text-soft">
              Result drops {gameDateTime(exam.resultAt, now)} ({relativeGameTime(exam.resultAt, now)}).
            </p>
          )}
        </div>
        {exam.status === 'registered' && (
          <>
            <StudyButton />
            {canSit ? (
              <ExamCentreGate venueId={exam.venueId}>
                <Button
                  size="lg"
                  block
                  icon={<PenLine size={18} aria-hidden />}
                  loading={sitExam.isPending}
                  onClick={() =>
                    sitExam.mutate(exam.id, {
                      onSuccess: () =>
                        announce('Exam started', {
                          body: `${formatGameDuration(EXAM_DURATION_MINUTES)} in the hall. Read the questions well. You go pass!`,
                        }),
                      onError: (error) => complain('Couldn’t start the exam', error),
                    })
                  }
                >
                  Write JAMB now · {formatGameDuration(EXAM_DURATION_MINUTES)}
                </Button>
              </ExamCentreGate>
            ) : (
              <p className="text-sm text-text-soft">
                You can write from <strong className="text-text">{formatDate(exam.canSitFrom)}</strong> (
                {relativeGameTime(exam.canSitFrom, now)}), 7am–3pm at {exam.venueName}.
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {exam && exam.score !== null && <ScoreLine examId={exam.id} score={exam.score} />}
      <p className="text-sm text-text-soft">
        Score 0–400. You need {JAMB_MIN_UNIVERSITY}+ for universities, {JAMB_MIN_POLYTECHNIC}+ for
        polytechnics. Registration is <Money amount={overview.prices.jamb} className="font-bold text-text" />{' '}
        at a CBT centre.
      </p>
      <Button
        variant="paper"
        className="self-start"
        onClick={() => openSheet({ kind: 'register', exam: 'jamb' })}
      >
        {exam ? 'Rewrite JAMB' : 'Register for JAMB'}
      </Button>
    </div>
  );
}

/** One-line JAMB summary for the road — never spoils a result you haven't opened yet. */
export function JambSummary({ overview }: { readonly overview: EducationOverviewDto }) {
  const exam = latestExam(overview.exams, 'jamb');
  const { revealed } = useScoreReveal(exam?.id ?? 'none');
  if (exam?.status === 'released' && !revealed) return <>Your result is out</>;
  if (overview.jamb.score !== null) return <>Best score {overview.jamb.score}</>;
  if (exam && exam.status !== 'released') return <>{overview.jamb.label}</>;
  return <>Register at a CBT centre, read, write</>;
}

const VERDICT_BADGE = {
  university: { tone: 'good', text: 'University-ready' },
  polytechnic: { tone: 'warn', text: 'Polytechnic-ready' },
  retake: { tone: 'bad', text: 'Below the minimum' },
} as const;

/** Your released score — kept sealed until you open it in the result card at the top. */
function ScoreLine({ examId, score }: { readonly examId: string; readonly score: number }) {
  const { revealed } = useScoreReveal(examId);
  if (!revealed)
    return (
      <p className="rounded-card bg-danfo-soft p-3 text-sm font-bold">
        Your result is out — open it at the top of School.
      </p>
    );
  const verdict = VERDICT_BADGE[jambVerdict(score)];
  return (
    <p className="flex items-center justify-between gap-3 rounded-card bg-paper-2 p-3.5">
      <span>
        <span className="block text-xs font-bold text-text-soft">Your UTME score</span>
        <span className="type-figure text-3xl">{score}</span>
        <span className="text-sm text-text-soft"> / {JAMB_MAX_SCORE}</span>
      </span>
      <Badge tone={verdict.tone}>{verdict.text}</Badge>
    </p>
  );
}
