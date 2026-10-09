'use client';

import { BedDouble, Clock3, Pill, Syringe } from 'lucide-react';
import { useState } from 'react';
import {
  SEVERITY_LABELS,
  formatDate,
  formatGameDuration,
  type FacilityDto,
  type HealthConditionDto,
  type HealthHereDto,
  type TreatmentMethod,
} from '@insidelife/shared';
import { Badge, Button, Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useHealthCommands } from '../../hooks/use-health';
import { announce, complain } from '@/common/game/feedback';
import {
  FACILITY_SHORT,
  SEVERITY_TONE,
  percent,
  recommendedQuote,
  sortQuotes,
} from '../../services/health-rules';
import { DirectionsLink } from '../DirectionsLink';
import { GoThere } from '@/common/components';

export interface ConditionCardProps {
  readonly condition: HealthConditionDto;
  readonly facilities: readonly FacilityDto[];
  readonly here: HealthHereDto | null;
}

/** One illness: symptoms, severity, advice, and what treatment costs and how well it works at each kind of place. */
export function ConditionCard({ condition, facilities, here }: ConditionCardProps) {
  const { treat } = useHealthCommands();
  const quotes = sortQuotes(condition.quotes);
  const best = recommendedQuote(condition.quotes, condition.severity);
  const nearest = (type: string) => facilities.find((facility) => facility.type === type)?.nearest ?? null;
  const canTreatHere =
    here !== null &&
    here.open &&
    condition.quotes.some((quote) => quote.facility === here.facility && quote.available);
  const bestVenue = best ? nearest(best.facility) : null;
  const hereQuote = here ? condition.quotes.find((quote) => quote.facility === here.facility) : undefined;
  const [method, setMethod] = useState<TreatmentMethod>('tablets');
  const chosen: TreatmentMethod = method === 'injection' && hereQuote?.injection ? 'injection' : 'tablets';

  const start = (): void =>
    treat.mutate({ conditionId: condition.id, method: chosen }, {
      onSuccess: (result) =>
        announce(`Treatment started at ${result.treatment.venueName}`, {
          body: result.treatment.message,
          amount: -result.treatment.paid,
        }),
      onError: (error) => complain('They couldn’t treat you', error),
    });

  return (
    <li className="flex flex-col gap-3 rounded-card bg-paper-2 p-3.5">
      <header className="flex items-start gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-card bg-paper text-2xl">
          {condition.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="type-title text-lg leading-tight">
            {condition.diagnosed ? condition.label : 'Something is not right'}
          </p>
          <p className="text-sm text-text-soft">{condition.symptoms.description}</p>
        </div>
        <Badge
          tone={SEVERITY_TONE[condition.severity]}
          className={cn('shrink-0', condition.severity === 'critical' && 'animate-pulse')}
        >
          {SEVERITY_LABELS[condition.severity]}
        </Badge>
      </header>
      <div className="flex flex-wrap gap-1.5">
        {condition.symptoms.energyCap < 100 && (
          <Badge tone="warn">Energy capped at {Math.round(condition.symptoms.energyCap)}</Badge>
        )}
        {condition.symptoms.mood < 0 && <Badge>Mood {condition.symptoms.mood}</Badge>}
        {!condition.diagnosed && <Badge tone="info">Undiagnosed — get a check-up</Badge>}
        {condition.admitted && (
          <Badge tone="info">
            <BedDouble size={12} aria-hidden /> On the ward
          </Badge>
        )}
        {condition.chronic && condition.managedUntil !== null && (
          <Badge tone="good">Medication until {formatDate(condition.managedUntil)}</Badge>
        )}
      </div>
      <p className="text-sm">{condition.advice}</p>

      {quotes.length > 0 && (
        <ul
          className="flex flex-col divide-y divide-line rounded-card bg-paper px-3"
          aria-label="Treatment options"
        >
          {quotes.map((quote) => {
            const venue = nearest(quote.facility);
            const isBest = best?.facility === quote.facility;
            return (
              <li key={quote.facility} className="flex flex-col gap-1 py-2.5 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold">
                    {FACILITY_SHORT[quote.facility]}
                    {isBest && <span className="ml-1.5 text-xs font-bold text-naira">Recommended</span>}
                  </span>
                  {quote.available ? (
                    <Money amount={quote.youPay} className="font-bold" />
                  ) : (
                    <span className="text-xs text-text-faint">Can’t treat this</span>
                  )}
                </div>
                {quote.available ? (
                  <p className="flex flex-wrap gap-x-3 text-xs text-text-soft">
                    <span>{percent(quote.successChance)} chance it works</span>
                    {quote.injection && (
                      <span className="inline-flex items-center gap-1">
                        <Syringe size={11} aria-hidden />
                        Injection <Money amount={quote.injection.youPay} compact /> · {percent(quote.injection.successChance)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Clock3 size={11} aria-hidden />
                      {formatGameDuration(quote.durationMinutes)}
                    </span>
                    {quote.coveredByHmo > 0 && (
                      <span>
                        HMO pays <Money amount={quote.coveredByHmo} compact />
                      </span>
                    )}
                    {quote.admissionDays > 0 && (
                      <span>
                        {quote.admissionDays}d on the ward at <Money amount={quote.admissionPerDay} compact />
                        /day
                      </span>
                    )}
                  </p>
                ) : (
                  quote.reason && <p className="text-xs text-text-soft">{quote.reason}</p>
                )}
                {quote.available && venue && !isBest && here?.facility !== quote.facility && (
                  <DirectionsLink venueId={venue.venueId} venueName={venue.name} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!condition.admitted &&
        (canTreatHere && here ? (
          <div className="flex flex-col gap-2">
            {hereQuote?.injection && (
              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="mb-1.5 text-sm font-bold">How do you want it?</legend>
                {(
                  [
                    { id: 'tablets', label: 'Tablets', icon: Pill, youPay: hereQuote.youPay, odds: hereQuote.successChance },
                    { id: 'injection', label: 'Injection', icon: Syringe, youPay: hereQuote.injection.youPay, odds: hereQuote.injection.successChance },
                  ] as const
                ).map((option) => (
                  <label
                    key={option.id}
                    className={cn(
                      'flex cursor-pointer flex-col gap-0.5 rounded-card bg-paper p-2.5 text-sm ring-1 ring-line has-[:checked]:ring-2 has-[:checked]:ring-danfo has-[:focus-visible]:outline has-[:focus-visible]:outline-2',
                    )}
                  >
                    <input type="radio" name={`method-${condition.id}`} value={option.id} checked={chosen === option.id} onChange={() => setMethod(option.id)} className="sr-only" />
                    <span className="flex items-center gap-1.5 font-bold">
                      <option.icon size={15} aria-hidden /> {option.label}
                    </span>
                    <span className="text-xs text-text-soft">
                      <Money amount={option.youPay} compact /> · {percent(option.odds)} chance
                    </span>
                    {option.id === 'injection' && <span className="text-xs text-text-faint">Works more often. E go pain you small.</span>}
                  </label>
                ))}
              </fieldset>
            )}
            <Button block loading={treat.isPending} onClick={start}>
              {chosen === 'injection' ? 'Get the injection' : 'Treat it here'} at {here.venueName}
            </Button>
          </div>
        ) : bestVenue && best ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              Best bet: <strong>{bestVenue.name}</strong> — {FACILITY_SHORT[best.facility].toLowerCase()}, you
              pay <Money amount={best.youPay} className="font-bold" />.
            </p>
            <GoThere venueId={bestVenue.venueId} venueName={bestVenue.name} />
          </div>
        ) : null)}
    </li>
  );
}
