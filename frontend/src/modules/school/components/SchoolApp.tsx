'use client';

import { TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  DEGREE_CLASS_LABELS,
  formatDate,
  type EducationOverviewDto,
  type GameMinute,
} from '@insidelife/shared';
import { Section } from '@/common/components';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useEducation } from '../hooks/use-education';
import { SchoolSheetsContext, type SchoolSheet } from '../hooks/use-school-sheets';
import { stageStatuses, type StageId } from '../services/school-rules';
import { ErrorState, LoadingRows } from '@/common/components';
import { CertificatesSection, ProgrammesSection } from './ProgrammesSection';
import { SchoolNextCard } from './SchoolNextCard';
import { SchoolSheets } from './sheets/SchoolSheets';
import { AdmissionStage } from './stages/AdmissionStage';
import { CampusStage } from './stages/CampusStage';
import { JambStage, JambSummary } from './stages/JambStage';
import { NyscStage } from './stages/NyscStage';
import { Stop } from './stages/Stop';
import { WaecStage } from './stages/WaecStage';

/** School phone app: the WAEC → JAMB → admission → campus → NYSC road, with the next step always on top. */
export function SchoolApp() {
  const query = useEducation();
  const now = useGameMinute(15_000);
  const [sheet, setSheet] = useState<SchoolSheet | null>(null);

  if (query.isPending) return <LoadingRows rows={4} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const overview = query.data;

  return (
    <SchoolSheetsContext.Provider value={setSheet}>
      <div className="flex flex-col gap-6">
        <SchoolNextCard overview={overview} now={now} />
        {overview.strike && !overview.strike.affectsYou && (
          <p className="flex items-start gap-2 rounded-card bg-danfo-soft p-3 text-sm">
            <TriangleAlert size={17} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              <strong>{overview.strike.title}.</strong> {overview.strike.description} Ends{' '}
              {formatDate(overview.strike.endsAt)}.
            </span>
          </p>
        )}
        <Section title="Your road" aside={overview.headline}>
          <ol className="mt-1 flex flex-col">
            {STAGE_ORDER.map((stage, index) => (
              <StageStop
                key={stage}
                stage={stage}
                index={index + 1}
                overview={overview}
                now={now}
                last={index === STAGE_ORDER.length - 1}
              />
            ))}
          </ol>
        </Section>
        <ProgrammesSection overview={overview} now={now} />
        <CertificatesSection overview={overview} />
      </div>
      <SchoolSheets sheet={sheet} overview={overview} onClose={() => setSheet(null)} />
    </SchoolSheetsContext.Provider>
  );
}

const STAGE_ORDER: readonly StageId[] = ['waec', 'jamb', 'admission', 'campus', 'nysc'];

function StageStop({
  stage,
  index,
  overview,
  now,
  last,
}: {
  readonly stage: StageId;
  readonly index: number;
  readonly overview: EducationOverviewDto;
  readonly now: GameMinute;
  readonly last: boolean;
}) {
  const status = stageStatuses(overview)[stage];
  const { title, summary, body } = stageContent(stage, overview, now);
  return (
    <Stop
      id={`school-stop-${stage}`}
      index={index}
      status={status}
      title={title}
      summary={summary}
      last={last}
    >
      {body}
    </Stop>
  );
}

function stageContent(
  stage: StageId,
  overview: EducationOverviewDto,
  now: GameMinute,
): { title: string; summary: ReactNode; body: ReactNode } {
  switch (stage) {
    case 'waec':
      return {
        title: 'WAEC',
        summary: `${overview.waec.credits} credits${overview.waec.hasMaths && overview.waec.hasEnglish ? ', Maths & English in' : ''}`,
        body: <WaecStage overview={overview} />,
      };
    case 'jamb': {
      return {
        title: 'JAMB UTME',
        summary: <JambSummary overview={overview} />,
        body: <JambStage overview={overview} now={now} />,
      };
    }
    case 'admission': {
      const accepted = overview.applications.find((application) => application.status === 'accepted');
      const offered = overview.applications.find((application) => application.status === 'offered');
      return {
        title: 'Admission',
        summary: accepted
          ? `${accepted.courseName}, ${accepted.institutionName}`
          : offered
            ? `Offer from ${offered.institutionName}`
            : 'Post-UTME screening and cut-offs',
        body: <AdmissionStage overview={overview} now={now} />,
      };
    }
    case 'campus': {
      const enrolment =
        overview.enrolment &&
        overview.enrolment.status !== 'graduated' &&
        overview.enrolment.status !== 'withdrawn'
          ? overview.enrolment
          : null;
      const degree = overview.degrees[0];
      return {
        title: enrolment ? enrolment.institutionName : 'University or polytechnic',
        summary: enrolment
          ? `${enrolment.level} ${enrolment.title}${enrolment.cgpa !== null ? ` · CGPA ${enrolment.cgpa.toFixed(2)}` : ''}`
          : degree
            ? `${degree.title} · ${DEGREE_CLASS_LABELS[degree.degreeClass].short}`
            : 'Lectures, CGPA, fees and the odd ASUU strike',
        body: enrolment ? <CampusStage enrolment={enrolment} now={now} /> : undefined,
      };
    }
    case 'nysc':
      return {
        title: 'NYSC',
        summary:
          overview.nysc.status === 'serving'
            ? `Serving · ${overview.nysc.ppaName ?? 'awaiting PPA'}`
            : overview.nysc.status === 'completed'
              ? 'Passed out'
              : overview.nysc.status === 'exempt'
                ? 'Exempted'
                : 'A year of service after graduating',
        body:
          overview.nysc.status === 'not-eligible' ? undefined : <NyscStage nysc={overview.nysc} now={now} />,
      };
  }
}
