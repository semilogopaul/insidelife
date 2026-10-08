'use client';

import { useState } from 'react';
import type { EducationOverviewDto, InstitutionKind } from '@insidelife/shared';
import { Badge, Button, Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useEducationCommands } from '../../hooks/use-education';
import { announce, complain } from '@/common/game/feedback';
import { SelectField } from '@/common/components';

const KIND_LABEL: Record<InstitutionKind, string> = {
  federal: 'Federal',
  state: 'State',
  private: 'Private',
  polytechnic: 'Polytechnic',
};

/** Pick a school, see each course's cut-off and fees, apply (screening fee is charged). */
export function ApplyForm({
  overview,
  onDone,
}: {
  readonly overview: EducationOverviewDto;
  readonly onDone: () => void;
}) {
  const { apply } = useEducationCommands();
  const institutions = overview.catalogue.institutions;
  const [institutionId, setInstitutionId] = useState(() => {
    const choice = overview.exams.find((exam) => exam.kind === 'jamb' && exam.firstChoice)?.firstChoice
      ?.institutionId;
    return choice ?? institutions[0]?.id ?? '';
  });
  const institution = institutions.find((entry) => entry.id === institutionId);
  const applied = new Set(
    overview.applications
      .filter((application) => application.status === 'screening' || application.status === 'offered')
      .map((application) => `${application.institutionId}:${application.courseId}`),
  );

  return (
    <div className="flex flex-col gap-4 pb-2">
      <SelectField
        label="School"
        value={institutionId}
        onChange={setInstitutionId}
        options={institutions.map((entry) => ({
          value: entry.id,
          label: `${entry.shortName} — ${entry.name}`,
        }))}
      />
      {institution && (
        <>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge tone="info">{KIND_LABEL[institution.kind]}</Badge>
            <Badge>Min. UTME {institution.minUtme}</Badge>
            <Badge>
              Screening <Money amount={institution.screeningFee} />
            </Badge>
            {institution.strike !== 'none' && (
              <Badge tone="warn">{institution.strike.toUpperCase()} strikes happen</Badge>
            )}
            {institution.outOfTown && <Badge tone="info">Out of town · hostel</Badge>}
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {institution.courses.map((course) => {
              const key = `${institution.id}:${course.courseId}`;
              const already = applied.has(key);
              return (
                <li key={course.courseId} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-bold">{course.title}</p>
                    <p className="text-text-soft">
                      Cut-off {course.cutoff} · {course.years} yrs ·{' '}
                      <Money amount={course.sessionFees} compact /> a session
                    </p>
                    {!course.eligible && course.reason && (
                      <p className="text-xs font-bold text-okada">{course.reason}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={course.eligible && !already ? 'ink' : 'paper'}
                    className={cn('shrink-0')}
                    disabled={!course.eligible || already || apply.isPending}
                    onClick={() =>
                      apply.mutate(
                        { institutionId: institution.id, courseId: course.courseId },
                        {
                          onSuccess: () => {
                            announce('Application in', {
                              body: `${institution.shortName} screening is done; decision in a few days.`,
                              amount: -institution.screeningFee,
                              serverNotifies: true,
                            });
                            onDone();
                          },
                          onError: (error) => complain('Application didn’t go through', error),
                        },
                      )
                    }
                  >
                    {already ? 'Applied' : 'Apply'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
