'use client';

import { Baby } from 'lucide-react';
import {
  PREGNANCY_TRIMESTERS,
  formatDate,
  type GameMinute,
  type HealthHereDto,
  type PregnancyDto,
} from '@insidelife/shared';
import { Badge, Button, Money, ProgressBar, Section } from '@/common/components';
import { useHealthCommands } from '../../hooks/use-health';
import { announce, complain } from '@/common/game/feedback';
import { relativeGameTime } from '@/common/utils/game-time';
import { FACILITY_SHORT, pregnancyProgress } from '../../services/health-rules';

/** The antenatal card: week, trimester, visits done, the next one, and what delivery costs where. */
export function PregnancyCard({
  pregnancy,
  here,
  now,
}: {
  readonly pregnancy: PregnancyDto;
  readonly here: HealthHereDto | null;
  readonly now: GameMinute;
}) {
  const { treat } = useHealthCommands();
  const { ratio, week } = pregnancyProgress(pregnancy.conceivedAt, now);
  const whose = pregnancy.carrier === 'self' ? 'You' : pregnancy.partnerName;
  const atHospital = here !== null && here.facility !== 'pharmacy' && here.open;
  const visitDue = pregnancy.nextVisitDue !== null && pregnancy.nextVisitDue <= now;

  return (
    <Section
      title="Pregnancy"
      aside={
        pregnancy.highRisk ? (
          <Badge tone="bad">High risk — extra care</Badge>
        ) : (
          <Badge tone="good">{PREGNANCY_TRIMESTERS[pregnancy.trimester].label}</Badge>
        )
      }
    >
      <div className="flex flex-col gap-3 rounded-card bg-ankara-soft p-3.5">
        <div className="flex items-start gap-3">
          <Baby size={26} aria-hidden className="shrink-0 text-ankara" />
          <div className="min-w-0 flex-1">
            <p className="type-title text-xl leading-tight">
              {whose === 'You' ? 'You are' : `${whose} is`} {week} weeks gone
            </p>
            <p className="text-sm text-text-soft">
              Due {formatDate(pregnancy.dueAt)} ({relativeGameTime(pregnancy.dueAt, now)}) ·{' '}
              {PREGNANCY_TRIMESTERS[pregnancy.trimester].description}
            </p>
          </div>
        </div>
        <ProgressBar value={ratio * 100} label="Pregnancy progress" tone="ink" />
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>
            Antenatal visits: <strong className="tabular">{pregnancy.antenatalVisits}</strong> of{' '}
            {pregnancy.recommendedVisits}
          </span>
          {pregnancy.nextVisitDue !== null && (
            <span className={visitDue ? 'font-bold text-okada' : 'text-text-soft'}>
              {visitDue ? 'Visit due now' : `Next ${relativeGameTime(pregnancy.nextVisitDue, now)}`}
            </span>
          )}
        </div>
        {atHospital && here ? (
          <Button
            variant="ink"
            loading={treat.isPending}
            onClick={() =>
              treat.mutate({ conditionId: pregnancy.id }, {
                onSuccess: (result) =>
                  announce('Antenatal visit', {
                    body: result.treatment.message,
                    amount: -result.treatment.paid,
                  }),
                onError: (error) => complain('Couldn’t book the visit', error),
              })
            }
          >
            Antenatal visit at {here.venueName}
          </Button>
        ) : (
          <p className="text-xs text-text-soft">
            Antenatal visits happen at a hospital. Delivery planned at{' '}
            {pregnancy.plannedVenueName ?? FACILITY_SHORT[pregnancy.plannedFacility].toLowerCase()}.
          </p>
        )}
      </div>
      <table className="w-full text-left text-sm">
        <caption className="mb-1 text-left text-xs font-bold text-text-soft">
          Delivery: what you’d pay (after HMO)
        </caption>
        <thead className="text-xs text-text-soft">
          <tr>
            <th scope="col" className="py-1 font-bold">
              Where
            </th>
            <th scope="col" className="py-1 text-right font-bold">
              Normal
            </th>
            <th scope="col" className="py-1 text-right font-bold">
              C-section
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {pregnancy.deliveryQuotes.map((quote) => (
            <tr key={quote.facility}>
              <th scope="row" className="py-1.5 font-normal">
                {FACILITY_SHORT[quote.facility]}
              </th>
              <td className="py-1.5 text-right font-bold">
                <Money amount={quote.normalYouPay} compact />
              </td>
              <td className="py-1.5 text-right font-bold">
                <Money amount={quote.cSectionYouPay} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
