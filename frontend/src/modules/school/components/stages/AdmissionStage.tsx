'use client';

import {
  MAX_PENDING_APPLICATIONS,
  type AdmissionApplicationDto,
  type AdmissionStatus,
  type EducationOverviewDto,
  type GameMinute,
} from '@insidelife/shared';
import { Badge, Button } from '@/common/components';
import { useOpenSchoolSheet } from '../../hooks/use-school-sheets';
import { gameDateTime, relativeGameTime } from '@/common/utils/game-time';
import { usableJambScore } from '../../services/school-rules';

const STATUS: Record<
  AdmissionStatus,
  { readonly tone: 'good' | 'bad' | 'warn' | 'info' | 'neutral'; readonly label: string }
> = {
  screening: { tone: 'info', label: 'Screening' },
  offered: { tone: 'good', label: 'Offered' },
  rejected: { tone: 'bad', label: 'Not admitted' },
  accepted: { tone: 'good', label: 'Accepted' },
  declined: { tone: 'neutral', label: 'Declined' },
  expired: { tone: 'neutral', label: 'Offer lapsed' },
};

/** Post-UTME: apply (up to three at once), watch decisions, accept an offer. */
export function AdmissionStage({
  overview,
  now,
}: {
  readonly overview: EducationOverviewDto;
  readonly now: GameMinute;
}) {
  const openSheet = useOpenSchoolSheet();
  const score = overview.jamb.score;
  const pending = overview.applications.filter((application) => application.status === 'screening').length;
  const applications = [...overview.applications].sort((a, b) => b.appliedAt - a.appliedAt);

  return (
    <div className="flex flex-col gap-3">
      {applications.length > 0 && (
        <ul className="flex flex-col gap-2">
          {applications.map((application) => (
            <ApplicationRow
              key={application.id}
              application={application}
              now={now}
              onAccept={() => openSheet({ kind: 'accept', applicationId: application.id })}
            />
          ))}
        </ul>
      )}
      {usableJambScore(score) ? (
        <>
          <p className="text-sm text-text-soft">
            Aggregate = UTME ÷ 8 + post-UTME screening (out of 50). Beat the course cut-off to get in.{' '}
            {pending} of {MAX_PENDING_APPLICATIONS} applications open.
          </p>
          <Button
            variant="paper"
            className="self-start"
            disabled={pending >= MAX_PENDING_APPLICATIONS}
            onClick={() => openSheet({ kind: 'apply' })}
          >
            Apply to a school
          </Button>
        </>
      ) : (
        <p className="text-sm text-text-soft">Unlocks with a JAMB score of 100+ (150+ for universities).</p>
      )}
    </div>
  );
}

function ApplicationRow({
  application,
  now,
  onAccept,
}: {
  readonly application: AdmissionApplicationDto;
  readonly now: GameMinute;
  readonly onAccept: () => void;
}) {
  const status = STATUS[application.status];
  return (
    <li className="rounded-card bg-paper-2 p-3.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{application.courseName}</p>
          <p className="truncate text-text-soft">{application.institutionName}</p>
        </div>
        <Badge tone={status.tone} className="shrink-0">
          {status.label}
        </Badge>
      </div>
      {application.status === 'screening' && (
        <p className="mt-2 text-text-soft">
          Decision {gameDateTime(application.decisionAt, now)} (
          {relativeGameTime(application.decisionAt, now)}). Cut-off {application.cutoff}.
        </p>
      )}
      {application.aggregate !== null && (
        <p className="mt-2">
          Aggregate <strong className="tabular">{application.aggregate.toFixed(1)}</strong> vs cut-off{' '}
          <strong className="tabular">{application.cutoff}</strong>
          {application.catchmentBonus > 0 && (
            <span className="text-text-soft"> (incl. +{application.catchmentBonus} catchment)</span>
          )}
          {application.supplementaryList && <span className="text-naira"> · supplementary list</span>}
        </p>
      )}
      {application.status === 'offered' && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {application.acceptBy !== null && (
            <span className="text-xs font-bold text-okada">
              Accept by {gameDateTime(application.acceptBy, now)}
            </span>
          )}
          <Button size="sm" variant="ink" onClick={onAccept}>
            Accept offer
          </Button>
        </div>
      )}
    </li>
  );
}
