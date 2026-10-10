'use client';

import { useMemo, useState } from 'react';
import { EXAM_DURATION_MINUTES, EXAM_PREP_DAYS, formatGameDuration, type EducationOverviewDto, type ExamKind } from '@insidelife/shared';
import { Button, Money } from '@/common/components';
import { useEducationCommands } from '../../hooks/use-education';
import { announce, complain } from '@/common/game/feedback';
import { Receipt } from '@/common/components';
import { SelectField } from '@/common/components';
import { ExamCentreGate } from '../stages/ExamCentreGate';

const LATER = '';

/** Register (and pay) for JAMB — optionally naming a first choice — or a WAEC GCE resit, in person at a CBT centre. */
export function RegisterExamForm({
  overview,
  exam,
  onDone,
}: {
  readonly overview: EducationOverviewDto;
  readonly exam: ExamKind;
  readonly onDone: () => void;
}) {
  const { registerExam } = useEducationCommands();
  const institutions = overview.catalogue.institutions;
  const [institutionId, setInstitutionId] = useState(LATER);
  const institution = institutions.find((entry) => entry.id === institutionId) ?? null;
  const [courseId, setCourseId] = useState(LATER);
  const courseOptions = useMemo(() => institution?.courses ?? [], [institution]);
  const fee = exam === 'jamb' ? overview.prices.jamb : overview.prices.waecGce;
  const label = exam === 'jamb' ? 'JAMB UTME' : 'WAEC GCE';

  const register = (): void =>
    registerExam.mutate(
      exam === 'jamb' && institution && courseId !== LATER
        ? { kind: exam, institutionId: institution.id, courseId }
        : { kind: exam },
      {
        onSuccess: () => {
          announce(`${label} registered ✍🏾`, {
            body: `Read for at least ${EXAM_PREP_DAYS} days, then write it here.`,
            amount: -fee,
            serverNotifies: true,
          });
          onDone();
        },
        onError: (error) => complain('Registration didn’t go through', error),
      },
    );

  return (
    <div className="flex flex-col gap-4 pb-2">
      {exam === 'jamb' && (
        <div className="flex flex-col gap-3">
          <SelectField
            label="First choice school (optional)"
            value={institutionId}
            onChange={(value) => {
              setInstitutionId(value);
              setCourseId(LATER);
            }}
            options={[
              { value: LATER, label: 'Decide after my result' },
              ...institutions.map((entry) => ({
                value: entry.id,
                label: `${entry.shortName} — ${entry.name}`,
              })),
            ]}
          />
          {institution && (
            <SelectField
              label="Course"
              value={courseId}
              onChange={setCourseId}
              options={[
                { value: LATER, label: 'Pick a course' },
                ...courseOptions.map((course) => ({
                  value: course.courseId,
                  label: `${course.title} · cut-off ${course.cutoff}`,
                })),
              ]}
            />
          )}
          <p className="text-xs text-text-soft">You can still apply anywhere once your score is out.</p>
        </div>
      )}
      <Receipt
        lines={[{ label: `${label} registration`, amount: fee }]}
        total={{ label: 'You pay now', amount: fee }}
        caption={`The paper can be written from ${EXAM_PREP_DAYS} days after registering, 7am–3pm at the same centre. It takes ${formatGameDuration(EXAM_DURATION_MINUTES)}.`}
      />
      <ExamCentreGate>
        <Button
          size="lg"
          block
          loading={registerExam.isPending}
          disabled={institution !== null && courseId === LATER}
          onClick={register}
        >
          Register and pay <Money amount={fee} />
        </Button>
      </ExamCentreGate>
    </div>
  );
}
