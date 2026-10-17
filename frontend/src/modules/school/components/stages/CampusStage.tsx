'use client';

import { useState } from 'react';
import {
  DEGREE_CLASS_LABELS,
  LECTURE_END_HOUR,
  LECTURE_START_HOUR,
  findInstitution,
  formatDate,
  formatGameDuration,
  type EducationEnrolmentDto,
  type GameMinute,
} from '@insidelife/shared';
import { Badge, Button, Money, ProgressBar } from '@/common/components';
import { useEducationCommands } from '../../hooks/use-education';
import { useOpenSchoolSheet } from '../../hooks/use-school-sheets';
import { announce, complain } from '@/common/game/feedback';
import { relativeGameTime } from '@/common/utils/game-time';
import { ConfirmSheet } from '@/common/components';
import { GoThere } from '@/common/components';
import { StudyButton } from './StudyButton';

function Bar({
  label,
  percent,
  detail,
  neutral = false,
}: {
  readonly label: string;
  readonly percent: number;
  readonly detail?: string;
  /** Plain progress (no good/bad colouring). */
  readonly neutral?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-bold">{label}</span>
        <span className="tabular font-bold">{pct}%</span>
      </div>
      <ProgressBar
        className="mt-1.5"
        value={pct}
        label={label}
        tone={neutral ? 'ink' : pct >= 75 ? 'naira' : pct >= 50 ? 'danfo' : 'okada'}
      />
      {detail && <p className="mt-1 text-xs text-text-soft">{detail}</p>}
    </div>
  );
}

/** Your programme: level, CGPA, this semester, fees, lectures and results. */
export function CampusStage({
  enrolment,
  now,
}: {
  readonly enrolment: EducationEnrolmentDto;
  readonly now: GameMinute;
}) {
  const openSheet = useOpenSchoolSheet();
  const { dropOut } = useEducationCommands();
  const [confirmDrop, setConfirmDrop] = useState(false);
  const institution = findInstitution(enrolment.institutionId);
  const projected = enrolment.projectedClass ? DEGREE_CLASS_LABELS[enrolment.projectedClass] : null;
  const fees = enrolment.fees;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        <Badge
          tone={enrolment.status === 'suspended' ? 'bad' : enrolment.status === 'admitted' ? 'info' : 'good'}
        >
          {enrolment.status === 'suspended'
            ? 'Suspended — fees unpaid'
            : enrolment.status === 'admitted'
              ? 'Resuming soon'
              : 'In session'}
        </Badge>
        <Badge>
          {enrolment.level} · semester {enrolment.semester} of {enrolment.totalSemesters}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-card bg-ink p-3.5 text-on-ink">
          <p className="text-xs font-bold text-on-ink-soft">CGPA</p>
          <p className="type-figure text-3xl text-danfo">
            {enrolment.cgpa !== null ? enrolment.cgpa.toFixed(2) : '—'}
          </p>
          <p className="text-xs text-on-ink-soft">
            {projected ? `On track for ${projected.short}` : 'First results after this semester'}
          </p>
        </div>
        <div className="rounded-card bg-paper-2 p-3.5">
          <p className="text-xs font-bold text-text-soft">Graduation</p>
          <p className="type-figure text-lg leading-tight">{formatDate(enrolment.expectedGraduationAt)}</p>
          <p className="text-xs text-text-soft">
            {enrolment.strikeDelayMinutes > 0
              ? `+${formatGameDuration(enrolment.strikeDelayMinutes)} lost to strikes`
              : relativeGameTime(enrolment.expectedGraduationAt, now)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 rounded-card bg-paper-2 p-3.5">
        <Bar
          label="This semester’s mastery"
          percent={enrolment.masteryPercent}
          detail="Lectures + self-study. Mastery drives your GPA."
        />
        <Bar label="Lecture attendance" percent={enrolment.attendancePercent} />
        <Bar label="Whole programme" percent={enrolment.progressPercent} neutral />
      </div>

      {fees.due > 0 ? (
        <div className="flex flex-col gap-2 rounded-card bg-okada-soft p-3.5 text-sm">
          <p>
            <strong>
              School fees due: <Money amount={fees.due} />
            </strong>
            {fees.graceUntil !== null && (
              <span className="block text-text-soft">
                Pay before {formatDate(fees.graceUntil)} or you’ll be suspended.
              </span>
            )}
          </p>
          <Button variant="paper" className="self-start" onClick={() => openSheet({ kind: 'fees' })}>
            Pay fees
          </Button>
        </div>
      ) : (
        <p className="text-sm text-text-soft">
          Fees paid for this session ({fees.paidSessions} paid so far).
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        <p className="text-sm">
          Lectures run weekdays {LECTURE_START_HOUR}am – {LECTURE_END_HOUR - 12}pm. Your routine takes you
          there; skipping hurts attendance.
        </p>
        <div className="flex flex-wrap gap-2">
          {institution && (
            <GoThere venueId={institution.venueId} venueName={institution.shortName} rideOption={false} />
          )}
          <StudyButton />
        </div>
      </div>

      {enrolment.semesterResults.length > 0 && (
        <table className="w-full text-left text-sm">
          <caption className="mb-1.5 text-left font-bold">Semester results</caption>
          <thead className="text-xs text-text-soft">
            <tr>
              <th scope="col" className="py-1 font-bold">
                Semester
              </th>
              <th scope="col" className="py-1 text-right font-bold">
                GPA
              </th>
              <th scope="col" className="py-1 text-right font-bold">
                Attendance
              </th>
            </tr>
          </thead>
          <tbody className="tabular divide-y divide-line">
            {enrolment.semesterResults.map((result) => (
              <tr key={`${result.session}-${result.semester}`}>
                <td className="py-1.5">
                  {result.level} · {result.semester === 1 ? 'First' : 'Second'}
                </td>
                <td className="py-1.5 text-right font-bold">{result.gpa.toFixed(2)}</td>
                <td className="py-1.5 text-right">{Math.round(result.attendance * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="self-start text-okada hover:bg-okada-soft"
        onClick={() => setConfirmDrop(true)}
      >
        Drop out
      </Button>
      <ConfirmSheet
        open={confirmDrop}
        onClose={() => setConfirmDrop(false)}
        title="Drop out?"
        description={`You leave ${enrolment.institutionName} without the ${enrolment.credential === 'bachelors' ? 'degree' : 'diploma'}. Fees already paid are gone.`}
        confirmLabel="Drop out"
        loading={dropOut.isPending}
        onConfirm={() =>
          dropOut.mutate(undefined, {
            onSuccess: () => {
              setConfirmDrop(false);
              announce('You dropped out', {
                body: 'School no be the only road. Check the Jobs app.',
                tone: 'neutral',
                serverNotifies: true,
              });
            },
            onError: (error) => complain('Couldn’t drop out', error),
          })
        }
      />
    </div>
  );
}
